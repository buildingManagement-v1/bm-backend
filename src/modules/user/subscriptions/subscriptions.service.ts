import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { isFreePlan } from 'src/common/plan-limits/free-plan.util';
import { buildPageInfo } from 'src/common/pagination';
import { PlanLimitsService } from 'src/common/plan-limits/plan-limits.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateSubscriptionDto, UpdateSubscriptionDto } from './dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { Prisma } from 'generated/prisma/client';
import { PdfService } from 'src/common/pdf/pdf.service';
import { EmailService } from 'src/common/email/email.service';
import { whereActive } from 'src/common/soft-delete/soft-delete.scope';

@Injectable()
export class SubscriptionsService {
  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
    private pdfService: PdfService,
    private emailService: EmailService,
    private planLimitsService: PlanLimitsService,
  ) {}

  async create(dto: CreateSubscriptionDto, adminId: string, adminName: string) {
    const [plan, owner] = await Promise.all([
      this.prisma.subscriptionPlan.findUnique({ where: { id: dto.planId } }),
      this.prisma.user.findFirst({
        where: { id: dto.userId, deletedAt: null },
        select: { id: true, name: true, email: true },
      }),
    ]);

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
    if (plan.status !== 'active') {
      throw new BadRequestException('Plan is not active');
    }
    if (!owner) {
      throw new NotFoundException('Owner not found');
    }

    const now = new Date();
    const existing = await this.prisma.subscription.findFirst({
      where: {
        userId: dto.userId,
        status: 'active',
        billingCycleEnd: { gte: now },
      },
      include: { plan: true },
    });
    // A free trial can be replaced by an assigned plan; a paid plan is changed
    // through the upgrade endpoint so proration stays consistent
    if (existing && !isFreePlan(existing.plan)) {
      throw new BadRequestException(
        `The owner already has an active ${existing.plan.name} plan. Use "Change plan" instead.`,
      );
    }

    const violations = await this.planLimitsService.usageViolations(
      dto.userId,
      plan.features,
    );
    if (violations.length > 0) {
      throw new BadRequestException(
        `The owner's usage doesn't fit ${plan.name}: ${violations.join(' ')}`,
      );
    }

    const totalAmount = Number(plan.price);
    const billingCycleStart = new Date(dto.billingCycleStart);
    const billingCycleEnd = new Date(billingCycleStart);
    billingCycleEnd.setMonth(
      billingCycleEnd.getMonth() + (dto.durationMonths ?? 12),
    );
    if (billingCycleEnd <= now) {
      throw new BadRequestException('This cycle would already be over');
    }

    const subscription = await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.subscription.update({
          where: { id: existing.id },
          data: { status: 'cancelled' },
        });
      }
      // Expired rows stay expired; make sure nothing else is left active
      await tx.subscription.updateMany({
        where: { userId: dto.userId, status: 'active' },
        data: { status: 'expired' },
      });
      const created = await tx.subscription.create({
        data: {
          userId: dto.userId,
          planId: dto.planId,
          totalAmount,
          billingCycleStart,
          billingCycleEnd,
          nextBillingDate: billingCycleEnd,
          status: 'active',
        },
        include: { plan: true },
      });
      await tx.subscriptionHistory.create({
        data: {
          userId: dto.userId,
          subscriptionId: created.id,
          action: 'created',
          oldPlanId: existing?.planId ?? null,
          newPlanId: dto.planId,
          notes: `Assigned by ${adminName}${dto.notes ? `: ${dto.notes}` : ''}`,
        },
      });
      return created;
    });

    await this.activityLogsService.createPlatformLog({
      action: 'create',
      entityType: 'subscription',
      entityId: subscription.id,
      adminId,
      adminName,
      details: {
        userId: dto.userId,
        ownerEmail: owner.email,
        planName: plan.name,
        totalAmount,
        replacedTrial: !!existing,
        notes: dto.notes ?? null,
      } as Prisma.InputJsonValue,
    });

    if (totalAmount > 0) {
      const invoiceNumber = `SUB-${subscription.id.substring(0, 8).toUpperCase()}`;
      const pdfDoc = this.pdfService.generateSubscriptionInvoice({
        invoiceNumber,
        date: subscription.createdAt,
        userName: owner.name,
        userEmail: owner.email,
        planName: plan.name,
        totalAmount,
        billingPeriod: {
          start: subscription.billingCycleStart,
          end: subscription.billingCycleEnd,
        },
      });
      const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
        pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
        pdfDoc.on('error', reject);
      });
      await this.emailService.sendSubscriptionInvoiceEmail(
        owner.email,
        owner.name,
        plan.name,
        totalAmount,
        invoiceNumber,
        pdfBuffer,
      );
    }

    return {
      success: true,
      data: subscription,
      message: existing
        ? `Free trial replaced by ${plan.name}`
        : 'Subscription created successfully',
    };
  }

  /** Pushes the cycle end out (offline renewal, goodwill credit). */
  async extend(
    id: string,
    months: number,
    reason: string,
    adminId: string,
    adminName: string,
  ) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
      include: { plan: true },
    });
    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }
    const now = new Date();
    if (subscription.status === 'cancelled') {
      throw new BadRequestException(
        'Reactivate the subscription before extending it',
      );
    }
    // An expired one can be revived only if the owner has nothing else active
    if (
      subscription.status === 'expired' ||
      subscription.billingCycleEnd < now
    ) {
      const other = await this.prisma.subscription.findFirst({
        where: {
          userId: subscription.userId,
          status: 'active',
          id: { not: id },
          billingCycleEnd: { gte: now },
        },
      });
      if (other) {
        throw new BadRequestException(
          'The owner has another active subscription; extend that one instead',
        );
      }
    }

    const from =
      subscription.billingCycleEnd > now ? subscription.billingCycleEnd : now;
    const end = new Date(from);
    end.setMonth(end.getMonth() + months);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.subscription.update({
        where: { id },
        data: {
          status: 'active',
          billingCycleEnd: end,
          nextBillingDate: end,
          expiryReminderSentAt: null,
        },
        include: { plan: true },
      });
      await tx.subscriptionHistory.create({
        data: {
          userId: subscription.userId,
          subscriptionId: id,
          action: 'renewed',
          oldPlanId: subscription.planId,
          newPlanId: subscription.planId,
          notes: `Extended ${months} month(s) by ${adminName}: ${reason}`,
        },
      });
      return result;
    });

    await this.activityLogsService.createPlatformLog({
      action: 'update',
      entityType: 'subscription',
      entityId: id,
      adminId,
      adminName,
      details: {
        userId: subscription.userId,
        extendedMonths: months,
        newEnd: end,
        reason,
      } as Prisma.InputJsonValue,
    });

    return {
      success: true,
      data: updated,
      message: `Extended to ${end.toDateString()}`,
    };
  }

  async findAll(userId: string) {
    const subscriptions = await this.prisma.subscription.findMany({
      where: { userId },
      include: {
        plan: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      success: true,
      data: subscriptions,
    };
  }

  /**
   * Get usage counts for an owner (buildings, units, managers) for subscription display.
   */
  async getUsageForUser(userId: string): Promise<{
    buildingsUsed: number;
    unitsUsed: number;
    managersUsed: number;
  }> {
    const [buildingsUsed, managersUsed, buildingIds] = await Promise.all([
      this.prisma.building.count({
        where: whereActive({ userId, status: 'active' as const }),
      }),
      this.prisma.manager.count({
        where: whereActive({ userId, status: 'active' as const }),
      }),
      this.prisma.building
        .findMany({
          where: whereActive({ userId, status: 'active' as const }),
          select: { id: true },
        })
        .then((rows) => rows.map((r) => r.id)),
    ]);

    const unitsUsed =
      buildingIds.length > 0
        ? await this.prisma.unit.count({
            where: whereActive({
              buildingId: { in: buildingIds },
              status: { not: 'inactive' as const },
            }),
          })
        : 0;

    return { buildingsUsed, unitsUsed, managersUsed };
  }

  async findAllSubscriptions(opts: {
    status?: string;
    q?: string;
    limit: number;
    offset: number;
  }) {
    const where: Prisma.SubscriptionWhereInput = {};
    if (
      opts.status &&
      ['active', 'cancelled', 'expired'].includes(opts.status)
    ) {
      where.status = opts.status as 'active' | 'cancelled' | 'expired';
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

    const [totalCount, subscriptions] = await Promise.all([
      this.prisma.subscription.count({ where }),
      this.prisma.subscription.findMany({
        where,
        include: { plan: true },
        orderBy: [{ status: 'asc' }, { billingCycleEnd: 'desc' }],
        take: opts.limit,
        skip: opts.offset,
      }),
    ]);

    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(subscriptions.map((s) => s.userId))] } },
      select: { id: true, name: true, email: true, deletedAt: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    return {
      success: true,
      data: subscriptions.map((sub) => ({
        ...sub,
        user: userById.get(sub.userId) ?? null,
      })),
      meta: { page_info: buildPageInfo(opts.limit, opts.offset, totalCount) },
    };
  }

  async findOne(id: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
      include: {
        plan: true,
        history: {
          include: {
            oldPlan: true,
            newPlan: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    return {
      success: true,
      data: subscription,
    };
  }

  async update(
    id: string,
    dto: UpdateSubscriptionDto,
    adminId: string,
    adminName: string,
  ) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
      include: { plan: true },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }
    if (subscription.status === dto.status) {
      throw new BadRequestException(
        `The subscription is already ${dto.status}`,
      );
    }
    if (dto.status === 'active') {
      if (subscription.billingCycleEnd < new Date()) {
        throw new BadRequestException(
          'This cycle has ended. Extend the subscription instead of reactivating it.',
        );
      }
      const other = await this.prisma.subscription.findFirst({
        where: {
          userId: subscription.userId,
          status: 'active',
          id: { not: id },
        },
        include: { plan: true },
      });
      if (other) {
        throw new BadRequestException(
          `The owner already has an active ${other.plan.name} subscription`,
        );
      }
    }

    const updated = await this.prisma.subscription.update({
      where: { id },
      data: { status: dto.status },
      include: { plan: true },
    });

    await this.prisma.subscriptionHistory.create({
      data: {
        userId: subscription.userId,
        subscriptionId: id,
        action: dto.status === 'cancelled' ? 'cancelled' : 'renewed',
        oldPlanId: subscription.planId,
        newPlanId: subscription.planId,
        notes: `${dto.status === 'cancelled' ? 'Cancelled' : 'Reactivated'} by ${adminName}`,
      },
    });

    await this.activityLogsService.createPlatformLog({
      action: 'status_change',
      entityType: 'subscription',
      entityId: id,
      adminId,
      adminName,
      details: {
        userId: subscription.userId,
        planName: subscription.plan.name,
        status: dto.status,
      } as Prisma.InputJsonValue,
    });

    return {
      success: true,
      data: updated,
      message:
        dto.status === 'cancelled'
          ? 'Subscription cancelled — the owner is now read-only'
          : 'Subscription reactivated',
    };
  }

  async calculateUpgradeProrating(subscriptionId: string, newPlanId: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (subscription.status !== 'active') {
      throw new BadRequestException('Can only upgrade active subscriptions');
    }

    const newPlan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: newPlanId },
    });

    if (!newPlan || newPlan.status !== 'active') {
      throw new NotFoundException('New plan not found or inactive');
    }

    const now = new Date();
    const cycleStart = new Date(subscription.billingCycleStart);
    const cycleEnd = new Date(subscription.billingCycleEnd);

    const totalDays = Math.ceil(
      (cycleEnd.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24),
    );
    const daysLeft = Math.ceil(
      (cycleEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysLeft <= 0) {
      throw new BadRequestException('Subscription billing cycle has ended');
    }

    const oldTotal = Number(subscription.totalAmount);
    const oldUnused = oldTotal * (daysLeft / totalDays);

    const newTotal = Number(newPlan.price);
    const newCost = newTotal * (daysLeft / totalDays);
    const proratedAmount = newCost - oldUnused;

    return {
      success: true,
      data: {
        oldTotal: Number(oldTotal.toFixed(2)),
        oldUnused: Number(oldUnused.toFixed(2)),
        newTotal: Number(newTotal.toFixed(2)),
        newCost: Number(newCost.toFixed(2)),
        proratedAmount: Number(proratedAmount.toFixed(2)),
        daysRemaining: daysLeft,
        totalDays,
      },
    };
  }

  async upgrade(
    subscriptionId: string,
    newPlanId: string,
    adminId: string,
    adminName: string,
  ) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    if (subscription.status !== 'active') {
      throw new BadRequestException('Can only upgrade active subscriptions');
    }

    const newPlan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: newPlanId },
    });

    if (!newPlan || newPlan.status !== 'active') {
      throw new NotFoundException('New plan not found or inactive');
    }

    if (newPlan.id === subscription.planId) {
      throw new BadRequestException('The subscription is already on this plan');
    }

    // Moving off the free trial starts a real one-year cycle
    if (isFreePlan(subscription.plan)) {
      return this.create(
        {
          userId: subscription.userId,
          planId: newPlanId,
          billingCycleStart: new Date().toISOString(),
        },
        adminId,
        adminName,
      );
    }

    const isDowngrade = Number(newPlan.price) < Number(subscription.plan.price);
    const violations = await this.planLimitsService.usageViolations(
      subscription.userId,
      newPlan.features,
    );
    if (violations.length > 0) {
      throw new BadRequestException(
        `The owner's usage doesn't fit ${newPlan.name}: ${violations.join(' ')}`,
      );
    }

    const now = new Date();
    const cycleStart = new Date(subscription.billingCycleStart);
    const cycleEnd = new Date(subscription.billingCycleEnd);

    const totalDays = Math.ceil(
      (cycleEnd.getTime() - cycleStart.getTime()) / (1000 * 60 * 60 * 24),
    );
    const daysLeft = Math.ceil(
      (cycleEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysLeft <= 0) {
      throw new BadRequestException('Subscription billing cycle has ended');
    }

    const oldTotal = Number(subscription.totalAmount);
    const oldUnused = oldTotal * (daysLeft / totalDays);

    const newTotal = Number(newPlan.price);
    const newCost = newTotal * (daysLeft / totalDays);
    const proratedAmount = newCost - oldUnused;

    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        planId: newPlanId,
        totalAmount: newTotal,
      },
      include: { plan: true },
    });

    await this.prisma.subscriptionHistory.create({
      data: {
        userId: subscription.userId,
        subscriptionId: subscription.id,
        action: isDowngrade ? 'downgraded' : 'upgraded',
        oldPlanId: subscription.planId,
        newPlanId: newPlanId,
        proratedAmount,
        notes: `${isDowngrade ? 'Downgraded' : 'Upgraded'} from ${subscription.plan.name} to ${newPlan.name}. Days remaining: ${daysLeft}`,
      },
    });

    await this.activityLogsService.createPlatformLog({
      action: 'update',
      entityType: 'subscription',
      entityId: subscriptionId,
      adminId,
      adminName,
      details: {
        type: isDowngrade ? 'downgrade' : 'upgrade',
        oldPlan: subscription.plan.name,
        newPlan: newPlan.name,
        proratedAmount: Number(proratedAmount.toFixed(2)),
        daysRemaining: daysLeft,
      } as Prisma.InputJsonValue,
    });

    // Get user info and send upgrade invoice email
    const user = await this.prisma.user.findUnique({
      where: { id: subscription.userId },
      select: { name: true, email: true },
    });

    if (user) {
      // Generate PDF invoice with prorated amount
      const invoiceNumber = `SUB-UPG-${subscriptionId.substring(0, 8)}`;
      const pdfDoc = this.pdfService.generateSubscriptionInvoice({
        invoiceNumber,
        date: new Date(),
        userName: user.name,
        userEmail: user.email,
        planName: newPlan.name,
        totalAmount: Number(newTotal),
        billingPeriod: {
          start: subscription.billingCycleStart,
          end: subscription.billingCycleEnd,
        },
        proratedAmount: Number(proratedAmount.toFixed(2)),
      });

      // Convert PDF stream to buffer
      const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        pdfDoc.on('data', (chunk) => chunks.push(chunk));
        pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
        pdfDoc.on('error', reject);
      });

      // Send email with PDF attachment
      await this.emailService.sendUpgradeInvoiceEmail(
        user.email,
        user.name,
        subscription.plan.name,
        newPlan.name,
        Number(proratedAmount.toFixed(2)),
        invoiceNumber,
        pdfBuffer,
      );
    }

    return {
      success: true,
      data: {
        subscription: updated,
        prorating: {
          oldTotal: Number(oldTotal.toFixed(2)),
          oldUnused: Number(oldUnused.toFixed(2)),
          newTotal: Number(newTotal.toFixed(2)),
          newCost: Number(newCost.toFixed(2)),
          proratedAmount: Number(proratedAmount.toFixed(2)),
          daysRemaining: daysLeft,
          totalDays,
        },
      },
      message: `Subscription ${isDowngrade ? 'downgraded' : 'upgraded'} successfully`,
    };
  }

  async downloadInvoice(id: string) {
    const result = await this.findOne(id);
    const subscription = result.data;

    const user = await this.prisma.user.findUnique({
      where: { id: subscription.userId },
      select: { name: true, email: true },
    });

    return this.pdfService.generateSubscriptionInvoice({
      invoiceNumber: `SUB-${subscription.id.substring(0, 8)}`,
      date: subscription.createdAt,
      userName: user?.name || 'User',
      userEmail: user?.email || '',
      planName: subscription.plan.name,
      totalAmount: Number(subscription.totalAmount),
      billingPeriod: {
        start: subscription.billingCycleStart,
        end: subscription.billingCycleEnd,
      },
    });
  }
}
