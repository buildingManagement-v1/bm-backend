import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Subscription } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { PlanLimitsService } from 'src/common/plan-limits/plan-limits.service';
import { EmailService } from 'src/common/email/email.service';
import { NotificationsService } from 'src/common/notifications/notifications.service';
import { PdfService } from 'src/common/pdf/pdf.service';
import { ActivityLogsService } from 'src/modules/user/activity-logs/activity-logs.service';
import { saveUpload } from 'src/common/uploads/uploads.util';
import { buildPageInfo } from 'src/common/pagination';
import { roundMoney } from 'src/common/lease/lease-cycles.util';
import { CreateSubscriptionRequestDto } from './dto';
import { SettingsService } from 'src/modules/platform-admin/settings/settings.service';
import {
  FREE_TRIAL_MONTHS,
  isFreePlan,
} from 'src/common/plan-limits/free-plan.util';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export { FREE_TRIAL_MONTHS, isFreePlan };

export type PlanChangeKind = 'new' | 'renewal' | 'upgrade' | 'downgrade';

function addYears(d: Date, years: number): Date {
  const next = new Date(d);
  next.setFullYear(next.getFullYear() + years);
  return next;
}

/**
 * Owner plan purchases. Owners pay by bank transfer and upload the receipt; a
 * billing admin verifies it and approves, which activates the plan. Paid plans
 * run for one year:
 *   - new (no paid plan, trial or expired): full price, a year from approval
 *   - renewal (same plan): full price, the cycle extends by a year
 *   - upgrade (pricier plan): the price difference for the remaining days,
 *     same cycle end
 *   - downgrade (cheaper plan): full price, a new year starts at approval and
 *     the rest of the current plan is forfeited; usage must fit the new plan
 */
@Injectable()
export class BillingService {
  constructor(
    private prisma: PrismaService,
    private planLimits: PlanLimitsService,
    private emailService: EmailService,
    private notificationsService: NotificationsService,
    private pdfService: PdfService,
    private activityLogsService: ActivityLogsService,
    private settingsService: SettingsService,
  ) {}

  /** The owner's current, unexpired subscription (if any). */
  async activeSubscription(userId: string) {
    return this.prisma.subscription.findFirst({
      where: { userId, status: 'active', billingCycleEnd: { gte: new Date() } },
      include: { plan: true },
      orderBy: { billingCycleEnd: 'desc' },
    });
  }

  async hasUsedTrial(userId: string): Promise<boolean> {
    const subs = await this.prisma.subscription.findMany({
      where: { userId },
      select: { plan: { select: { name: true, price: true } } },
    });
    return subs.some((s) => isFreePlan(s.plan));
  }

  /** Gives an owner the one-time Free trial. Callers check eligibility. */
  async startTrial(userId: string) {
    const freePlan = await this.prisma.subscriptionPlan.findFirst({
      where: {
        name: { equals: 'free', mode: 'insensitive' },
        status: 'active',
      },
    });
    if (!freePlan) {
      throw new NotFoundException('The Free plan is not available');
    }
    const start = new Date();
    const end = new Date(start);
    end.setMonth(end.getMonth() + FREE_TRIAL_MONTHS);

    return this.prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          userId,
          planId: freePlan.id,
          totalAmount: 0,
          billingCycleStart: start,
          billingCycleEnd: end,
          nextBillingDate: end,
          status: 'active',
        },
        include: { plan: true },
      });
      await tx.subscriptionHistory.create({
        data: {
          userId,
          subscriptionId: subscription.id,
          action: 'created',
          newPlanId: freePlan.id,
          notes: `${FREE_TRIAL_MONTHS}-month free trial`,
        },
      });
      return subscription;
    });
  }

  /** Plans an owner can buy: public paid plans, plus their current plan. */
  async availablePlans(userId: string) {
    const current = await this.activeSubscription(userId);
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: {
        status: 'active',
        OR: [{ type: 'public' }, ...(current ? [{ id: current.planId }] : [])],
      },
      orderBy: { price: 'asc' },
    });
    return plans.map((p) => ({
      ...p,
      purchasable: !isFreePlan(p),
      isCurrent: current?.planId === p.id,
    }));
  }

  async quote(userId: string, planId: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });
    const current = await this.activeSubscription(userId);

    if (
      !plan ||
      plan.status !== 'active' ||
      (plan.type !== 'public' && current?.planId !== plan.id)
    ) {
      throw new NotFoundException('Plan not found');
    }
    if (isFreePlan(plan)) {
      throw new BadRequestException(
        'The Free plan is a one-time trial and cannot be purchased',
      );
    }

    const now = new Date();
    const price = Number(plan.price);
    let kind: PlanChangeKind;
    let amount = price;
    let cycleStart = now;
    let cycleEnd = addYears(now, 1);
    let note: string | null = null;

    if (!current || isFreePlan(current.plan)) {
      kind = 'new';
    } else if (current.planId === plan.id) {
      kind = 'renewal';
      cycleStart = current.billingCycleStart;
      cycleEnd = addYears(current.billingCycleEnd, 1);
    } else if (price > Number(current.plan.price)) {
      kind = 'upgrade';
      const total =
        current.billingCycleEnd.getTime() - current.billingCycleStart.getTime();
      const left = current.billingCycleEnd.getTime() - now.getTime();
      const share = total > 0 ? Math.max(0, Math.min(1, left / total)) : 1;
      amount = roundMoney((price - Number(current.plan.price)) * share);
      cycleStart = current.billingCycleStart;
      cycleEnd = current.billingCycleEnd;
      note = `You pay the difference for the ${Math.ceil(left / MS_PER_DAY)} days left in your current cycle.`;
    } else {
      kind = 'downgrade';
      note = `A new one-year ${plan.name} cycle starts when approved; the remaining time on ${current.plan.name} is not refunded.`;
    }

    const violations =
      kind === 'upgrade' || kind === 'renewal'
        ? []
        : await this.planLimits.usageViolations(userId, plan.features);

    return {
      plan: {
        id: plan.id,
        name: plan.name,
        price,
        features: plan.features,
      },
      currentPlan: current
        ? {
            id: current.plan.id,
            name: current.plan.name,
            billingCycleEnd: current.billingCycleEnd,
          }
        : null,
      kind,
      amount,
      cycleStart,
      cycleEnd,
      note,
      violations,
      paymentInstructions: await this.settingsService.get(
        'billing.paymentInstructions',
      ),
    };
  }

  async createRequest(
    userId: string,
    dto: CreateSubscriptionRequestDto,
    file: { buffer: Buffer } | undefined,
  ) {
    const pending = await this.prisma.subscriptionRequest.findFirst({
      where: { userId, status: 'pending' },
      select: { id: true },
    });
    if (pending) {
      throw new ConflictException(
        'You already have a plan request under review. Cancel it to submit a new one.',
      );
    }

    const quote = await this.quote(userId, dto.planId);
    if (quote.violations.length > 0) {
      throw new BadRequestException(
        `Your current usage doesn't fit the ${quote.plan.name} plan: ${quote.violations.join(' ')}`,
      );
    }
    if (quote.amount <= 0) {
      throw new BadRequestException('Nothing to pay for this change');
    }

    const receiptUrl = await saveUpload(file, 'subscription-receipts', {
      allowPdf: true,
      label: 'Payment receipt',
    });

    const request = await this.prisma.subscriptionRequest.create({
      data: {
        userId,
        planId: dto.planId,
        amount: quote.amount,
        receiptUrl,
        paymentReference: dto.paymentReference?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
      include: { plan: { select: { id: true, name: true, price: true } } },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    if (user) {
      await this.emailService.sendSubscriptionRequestReceivedEmail(
        user.email,
        user.name,
        quote.plan.name,
        quote.amount,
      );
      // Billing admins have no inbox in the app: tell them by email
      const reviewers = await this.prisma.platformAdmin.findMany({
        where: {
          status: 'active',
          roles: { hasSome: ['super_admin', 'billing_manager'] },
        },
        select: { email: true },
      });
      await this.emailService.sendPlanRequestToAdminsEmail(
        reviewers.map((a) => a.email),
        user.name,
        quote.plan.name,
        quote.amount,
      );
    }

    return { ...request, kind: quote.kind };
  }

  async listMine(userId: string) {
    return this.prisma.subscriptionRequest.findMany({
      where: { userId },
      include: { plan: { select: { id: true, name: true, price: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancel(userId: string, requestId: string) {
    const result = await this.prisma.subscriptionRequest.updateMany({
      where: { id: requestId, userId, status: 'pending' },
      data: { status: 'cancelled' },
    });
    if (result.count === 0) {
      throw new NotFoundException('No pending request to cancel');
    }
    return { message: 'Request cancelled' };
  }

  async receiptFor(requestId: string, userId?: string): Promise<string> {
    const request = await this.prisma.subscriptionRequest.findFirst({
      where: { id: requestId, ...(userId && { userId }) },
      select: { receiptUrl: true },
    });
    if (!request) {
      throw new NotFoundException('Request not found');
    }
    return request.receiptUrl;
  }

  // ─── Platform admin review ─────────────────────────────────────────────

  async adminList(opts: {
    status?: string;
    q?: string;
    limit: number;
    offset: number;
  }) {
    const where: Prisma.SubscriptionRequestWhereInput = {};
    if (
      opts.status &&
      ['pending', 'approved', 'rejected', 'cancelled'].includes(opts.status)
    ) {
      where.status =
        opts.status as Prisma.SubscriptionRequestWhereInput['status'];
    }
    if (opts.q?.trim()) {
      const users = await this.prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: opts.q.trim(), mode: 'insensitive' } },
            { email: { contains: opts.q.trim(), mode: 'insensitive' } },
          ],
        },
        select: { id: true },
      });
      where.userId = { in: users.map((u) => u.id) };
    }

    const [totalCount, rows] = await Promise.all([
      this.prisma.subscriptionRequest.count({ where }),
      this.prisma.subscriptionRequest.findMany({
        where,
        include: { plan: { select: { id: true, name: true, price: true } } },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: opts.limit,
        skip: opts.offset,
      }),
    ]);

    const owners = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((r) => r.userId))] } },
      select: { id: true, name: true, email: true },
    });
    const ownerById = new Map(owners.map((o) => [o.id, o]));

    return {
      items: rows.map((r) => ({
        ...r,
        owner: ownerById.get(r.userId) ?? null,
      })),
      pageInfo: buildPageInfo(opts.limit, opts.offset, totalCount),
    };
  }

  async approve(requestId: string, admin: { id: string; name: string }) {
    const claim = await this.prisma.subscriptionRequest.updateMany({
      where: { id: requestId, status: 'pending' },
      data: {
        status: 'approved',
        reviewedAt: new Date(),
        reviewedById: admin.id,
      },
    });
    if (claim.count === 0) {
      throw new ConflictException('This request is not pending');
    }

    try {
      return await this.activate(requestId, admin);
    } catch (error) {
      await this.prisma.subscriptionRequest.update({
        where: { id: requestId },
        data: { status: 'pending', reviewedAt: null, reviewedById: null },
      });
      throw error;
    }
  }

  async reject(
    requestId: string,
    admin: { id: string; name: string },
    reason: string,
  ) {
    const claim = await this.prisma.subscriptionRequest.updateMany({
      where: { id: requestId, status: 'pending' },
      data: {
        status: 'rejected',
        reviewedAt: new Date(),
        reviewedById: admin.id,
        rejectionReason: reason,
      },
    });
    if (claim.count === 0) {
      throw new ConflictException('This request is not pending');
    }

    const request = await this.prisma.subscriptionRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { plan: { select: { name: true } } },
    });
    await this.notifyOwner(request.userId, request.plan.name, false, reason);
    await this.activityLogsService.createPlatformLog({
      action: 'status_change',
      entityType: 'subscription_request',
      entityId: requestId,
      adminId: admin.id,
      adminName: admin.name,
      details: { status: 'rejected', reason } as Prisma.InputJsonValue,
    });
    return { message: 'Request rejected' };
  }

  /** Applies an approved request to the owner's subscription. */
  private async activate(
    requestId: string,
    admin: { id: string; name: string },
  ) {
    const request = await this.prisma.subscriptionRequest.findUniqueOrThrow({
      where: { id: requestId },
      include: { plan: true },
    });
    const plan = request.plan;
    if (plan.status !== 'active') {
      throw new BadRequestException('This plan is no longer active');
    }

    const now = new Date();
    const current = await this.activeSubscription(request.userId);
    const price = Number(plan.price);

    // Decide against the owner's state now, not when they submitted
    let kind: PlanChangeKind;
    if (!current || isFreePlan(current.plan)) kind = 'new';
    else if (current.planId === plan.id) kind = 'renewal';
    else if (price > Number(current.plan.price)) kind = 'upgrade';
    else kind = 'downgrade';

    if (kind === 'new' || kind === 'downgrade') {
      const violations = await this.planLimits.usageViolations(
        request.userId,
        plan.features,
      );
      if (violations.length > 0) {
        throw new BadRequestException(
          `The owner's usage no longer fits ${plan.name}: ${violations.join(' ')}`,
        );
      }
    }

    const subscription = await this.prisma.$transaction(async (tx) => {
      let sub: Subscription;
      if (kind === 'renewal' && current) {
        const from =
          current.billingCycleEnd > now ? current.billingCycleEnd : now;
        const end = addYears(from, 1);
        sub = await tx.subscription.update({
          where: { id: current.id },
          data: {
            billingCycleEnd: end,
            nextBillingDate: end,
            totalAmount: price,
            expiryReminderSentAt: null,
          },
        });
      } else if (kind === 'upgrade' && current) {
        sub = await tx.subscription.update({
          where: { id: current.id },
          data: { planId: plan.id, totalAmount: price },
        });
      } else {
        if (current) {
          await tx.subscription.update({
            where: { id: current.id },
            data: { status: 'cancelled' },
          });
        }
        const end = addYears(now, 1);
        sub = await tx.subscription.create({
          data: {
            userId: request.userId,
            planId: plan.id,
            totalAmount: price,
            billingCycleStart: now,
            billingCycleEnd: end,
            nextBillingDate: end,
            status: 'active',
          },
        });
      }

      await tx.subscriptionHistory.create({
        data: {
          userId: request.userId,
          subscriptionId: sub.id,
          action:
            kind === 'new'
              ? 'created'
              : kind === 'renewal'
                ? 'renewed'
                : kind === 'upgrade'
                  ? 'upgraded'
                  : 'downgraded',
          oldPlanId: current?.planId ?? null,
          newPlanId: plan.id,
          proratedAmount: kind === 'upgrade' ? request.amount : null,
          notes: `Bank transfer request ${request.id}${request.paymentReference ? ` (ref ${request.paymentReference})` : ''}, approved by ${admin.name}`,
        },
      });

      await tx.subscriptionRequest.update({
        where: { id: request.id },
        data: { subscriptionId: sub.id },
      });

      return sub;
    });

    await this.activityLogsService.createPlatformLog({
      action: 'status_change',
      entityType: 'subscription_request',
      entityId: request.id,
      adminId: admin.id,
      adminName: admin.name,
      details: {
        status: 'approved',
        kind,
        userId: request.userId,
        planName: plan.name,
        amount: Number(request.amount),
      } as Prisma.InputJsonValue,
    });

    await this.sendInvoice(request.userId, {
      invoiceNumber: `SUB-${request.id.slice(0, 8).toUpperCase()}`,
      planName: plan.name,
      amount: Number(request.amount),
      start: subscription.billingCycleStart,
      end: subscription.billingCycleEnd,
    });
    await this.notifyOwner(request.userId, plan.name, true);

    return { message: 'Plan activated', kind, subscription };
  }

  private async notifyOwner(
    userId: string,
    planName: string,
    approved: boolean,
    reason?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    if (!user) return;
    await this.notificationsService.create({
      userId,
      userType: 'user',
      type: 'subscription_request_updated',
      title: approved ? 'Plan activated' : 'Plan request rejected',
      message: approved
        ? `Your ${planName} plan is now active.`
        : `Your ${planName} plan request was rejected. Reason: ${reason}`,
      link: '/dashboard/subscriptions',
    });
    await this.emailService.sendSubscriptionRequestReviewedEmail(
      user.email,
      user.name,
      planName,
      approved,
      reason,
    );
  }

  private async sendInvoice(
    userId: string,
    data: {
      invoiceNumber: string;
      planName: string;
      amount: number;
      start: Date;
      end: Date;
    },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });
    if (!user) return;
    const pdfDoc = this.pdfService.generateSubscriptionInvoice({
      invoiceNumber: data.invoiceNumber,
      date: new Date(),
      userName: user.name,
      userEmail: user.email,
      planName: data.planName,
      totalAmount: data.amount,
      billingPeriod: { start: data.start, end: data.end },
    });
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
    });
    await this.emailService.sendSubscriptionInvoiceEmail(
      user.email,
      user.name,
      data.planName,
      data.amount,
      data.invoiceNumber,
      pdfBuffer,
    );
  }
}
