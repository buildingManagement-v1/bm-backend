import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService, formatDate } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UserDeletionService } from '../user-deletion/user-deletion.service';
import { TokenService } from '../token/token.service';
import {
  APP_TIMEZONE,
  addDays,
  isoDate,
  roundMoney,
  todayDate,
} from '../lease/lease-cycles.util';
import { releaseLeaseResources } from '../lease/lease-closure';
import { computeRentTaxBreakdown } from '../tax/rent-period.util';

/** Rent reminders go out this many days before a cycle's collection day. */
const RENT_REMINDER_DAYS = 3;
const LEASE_EXPIRY_NOTICE_DAYS = 30;
const SUBSCRIPTION_EXPIRY_NOTICE_DAYS = 7;

const cronOptions = { timeZone: APP_TIMEZONE };

/**
 * Daily jobs, run in the business timezone. Every notice is sent once: the
 * row it concerns records when it was sent (or the job only acts on a status
 * transition), so a re-run never repeats an email.
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private notificationsService: NotificationsService,
    private userDeletionService: UserDeletionService,
    private tokenService: TokenService,
  ) {}

  // ========== LEASES & RENT ==========

  /**
   * Unpaid rent becomes overdue once the building's grace period after the
   * cycle's collection day (its start) has passed. Tenants get one notice per
   * newly overdue batch; owners/payment managers get a summary per building.
   */
  @Cron('5 0 * * *', { ...cronOptions, name: 'mark-overdue-rent' })
  async markOverduePaymentPeriods() {
    const today = todayDate();
    const candidates = await this.prisma.paymentPeriod.findMany({
      where: {
        status: 'unpaid',
        periodStart: { lt: today },
        lease: { deletedAt: null, tenant: { deletedAt: null } },
      },
      include: {
        lease: {
          select: {
            id: true,
            applyWithholding: true,
            tenant: { select: { id: true, name: true, email: true } },
            unit: { select: { unitNumber: true } },
            building: {
              select: {
                id: true,
                name: true,
                paymentGraceDays: true,
                vatRate: true,
                withholdingRate: true,
              },
            },
          },
        },
      },
    });

    const due = candidates.filter(
      (p) =>
        p.periodStart &&
        addDays(p.periodStart, p.lease.building.paymentGraceDays) < today,
    );
    if (due.length === 0) {
      this.logger.log('Marked 0 payment period(s) as overdue');
      return 0;
    }

    await this.prisma.paymentPeriod.updateMany({
      where: { id: { in: due.map((p) => p.id) }, status: 'unpaid' },
      data: { status: 'overdue' },
    });

    const byLease = groupBy(due, (p) => p.lease.id);
    const perBuilding = new Map<string, { name: string; count: number }>();
    for (const periods of byLease.values()) {
      const { lease } = periods[0];
      const base = periods.reduce((sum, p) => sum + Number(p.rentAmount), 0);
      const { totalAmount } = computeRentTaxBreakdown(
        roundMoney(base),
        Number(lease.building.vatRate ?? 0),
        Number(lease.building.withholdingRate ?? 0),
        lease.applyWithholding,
      );
      const labels = periods.map((p) => formatDate(p.periodStart!));

      await this.notificationsService.create({
        userId: lease.tenant.id,
        userType: 'tenant',
        type: 'rent_overdue',
        title: 'Rent overdue',
        message: `Rent for Unit ${lease.unit.unitNumber} is overdue (${labels.join(', ')}). Amount: ETB ${totalAmount.toLocaleString()}.`,
        link: '/tenant/payments',
      });
      await this.emailService.sendRentOverdueEmail(
        lease.tenant.email,
        lease.tenant.name,
        lease.unit.unitNumber,
        totalAmount,
        labels,
      );

      const entry = perBuilding.get(lease.building.id) ?? {
        name: lease.building.name,
        count: 0,
      };
      entry.count += periods.length;
      perBuilding.set(lease.building.id, entry);
    }

    for (const [buildingId, { name, count }] of perBuilding) {
      await this.notificationsService.notifyBuildingStaff(
        buildingId,
        ['payment_manager'],
        {
          type: 'rent_overdue',
          title: 'Rent overdue',
          message: `${count} rent period(s) at ${name} became overdue today.`,
          link: '/dashboard/payments',
        },
      );
    }

    this.logger.log(`Marked ${due.length} payment period(s) as overdue`);
    return due.length;
  }

  /** One reminder per rent cycle, a few days before its collection day. */
  @Cron('0 8 * * *', { ...cronOptions, name: 'rent-due-reminders' })
  async sendRentDueReminders() {
    const today = todayDate();
    const periods = await this.prisma.paymentPeriod.findMany({
      where: {
        status: 'unpaid',
        reminderSentAt: null,
        periodStart: { gte: today, lte: addDays(today, RENT_REMINDER_DAYS) },
        lease: {
          status: 'active',
          deletedAt: null,
          tenant: { deletedAt: null },
        },
      },
      include: {
        lease: {
          select: {
            applyWithholding: true,
            tenant: { select: { id: true, name: true, email: true } },
            unit: { select: { unitNumber: true } },
            building: { select: { vatRate: true, withholdingRate: true } },
          },
        },
      },
    });

    for (const p of periods) {
      const { lease } = p;
      const { totalAmount } = computeRentTaxBreakdown(
        Number(p.rentAmount),
        Number(lease.building.vatRate ?? 0),
        Number(lease.building.withholdingRate ?? 0),
        lease.applyWithholding,
      );
      await this.notificationsService.create({
        userId: lease.tenant.id,
        userType: 'tenant',
        type: 'rent_due',
        title: 'Rent due soon',
        message: `Rent of ETB ${totalAmount.toLocaleString()} for Unit ${lease.unit.unitNumber} is due on ${formatDate(p.periodStart!)}.`,
        link: '/tenant/payments',
      });
      await this.emailService.sendRentDueReminderEmail(
        lease.tenant.email,
        lease.tenant.name,
        lease.unit.unitNumber,
        totalAmount,
        p.periodStart!,
      );
      await this.prisma.paymentPeriod.update({
        where: { id: p.id },
        data: { reminderSentAt: new Date() },
      });
    }

    this.logger.log(`Sent ${periods.length} rent reminder(s)`);
    return periods.length;
  }

  /** Leases whose end date has passed expire and release the unit. */
  @Cron('10 0 * * *', { ...cronOptions, name: 'expire-leases' })
  async checkExpiredLeases() {
    const today = todayDate();
    const expired = await this.prisma.lease.findMany({
      where: { status: 'active', deletedAt: null, endDate: { lt: today } },
      select: {
        id: true,
        unitId: true,
        tenantId: true,
        buildingId: true,
        tenant: { select: { name: true, email: true } },
        unit: { select: { unitNumber: true } },
      },
    });

    for (const lease of expired) {
      try {
        const now = new Date();
        await this.prisma.$transaction(async (tx) => {
          await tx.lease.update({
            where: { id: lease.id },
            data: { status: 'expired' },
          });
          await releaseLeaseResources(tx, lease, {
            actorId: null,
            reason: 'Lease expired',
            at: now,
          });
        });

        await this.emailService.sendLeaseExpiredEmail(
          lease.tenant.email,
          lease.tenant.name,
          lease.unit.unitNumber,
        );
        await this.notificationsService.create({
          userId: lease.tenantId,
          userType: 'tenant',
          type: 'lease_expired',
          title: 'Lease expired',
          message: `Your lease for Unit ${lease.unit.unitNumber} has ended.`,
          link: '/tenant/dashboard',
        });
        await this.notificationsService.notifyBuildingStaff(
          lease.buildingId,
          ['tenant_manager'],
          {
            type: 'lease_expired',
            title: 'Lease expired',
            message: `${lease.tenant.name}'s lease for Unit ${lease.unit.unitNumber} has expired and the unit is now vacant.`,
            link: '/dashboard/leases',
          },
        );
      } catch (error) {
        this.logger.error(`Failed to expire lease ${lease.id}`, error);
      }
    }

    this.logger.log(`Expired ${expired.length} lease(s)`);
    return expired.length;
  }

  /** One notice per lease, to tenant and staff, 30 days before it ends. */
  @Cron('0 11 * * *', { ...cronOptions, name: 'lease-expiry-notices' })
  async checkExpiringLeases() {
    const today = todayDate();
    const leases = await this.prisma.lease.findMany({
      where: {
        status: 'active',
        deletedAt: null,
        expiryNoticeSentAt: null,
        endDate: { gte: today, lte: addDays(today, LEASE_EXPIRY_NOTICE_DAYS) },
      },
      select: {
        id: true,
        endDate: true,
        tenantId: true,
        buildingId: true,
        tenant: { select: { name: true, email: true } },
        unit: { select: { unitNumber: true } },
      },
    });

    for (const lease of leases) {
      try {
        await this.emailService.sendLeaseExpiringEmail(
          lease.tenant.email,
          lease.tenant.name,
          lease.unit.unitNumber,
          lease.endDate,
        );
        await this.notificationsService.create({
          userId: lease.tenantId,
          userType: 'tenant',
          type: 'lease_expiring',
          title: 'Lease ending soon',
          message: `Your lease for Unit ${lease.unit.unitNumber} ends on ${isoDate(lease.endDate)}.`,
          link: '/tenant/dashboard',
        });
        await this.notificationsService.notifyBuildingStaff(
          lease.buildingId,
          ['tenant_manager'],
          {
            type: 'lease_expiring',
            title: 'Lease ending soon',
            message: `${lease.tenant.name}'s lease for Unit ${lease.unit.unitNumber} ends on ${isoDate(lease.endDate)}. Renew it or plan the move-out.`,
            link: '/dashboard/leases',
          },
        );
        await this.prisma.lease.update({
          where: { id: lease.id },
          data: { expiryNoticeSentAt: new Date() },
        });
      } catch (error) {
        this.logger.error(`Failed to send lease expiry notice`, error);
      }
    }

    this.logger.log(`Sent ${leases.length} lease expiry notice(s)`);
    return leases.length;
  }

  // ========== SUBSCRIPTIONS ==========

  @Cron('0 9 * * *', {
    ...cronOptions,
    name: 'subscription-expiry-reminders',
  })
  async checkExpiringSubscriptions() {
    const now = new Date();
    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        status: 'active',
        expiryReminderSentAt: null,
        billingCycleEnd: {
          gte: now,
          lte: addDays(now, SUBSCRIPTION_EXPIRY_NOTICE_DAYS),
        },
      },
      select: {
        id: true,
        userId: true,
        billingCycleEnd: true,
        plan: { select: { name: true } },
      },
    });

    for (const subscription of subscriptions) {
      try {
        const user = await this.prisma.user.findFirst({
          where: { id: subscription.userId, deletedAt: null },
          select: { name: true, email: true },
        });
        if (user) {
          await this.emailService.sendSubscriptionExpiringEmail(
            user.email,
            user.name,
            subscription.plan.name,
            subscription.billingCycleEnd,
          );
          await this.notificationsService.create({
            userId: subscription.userId,
            userType: 'user',
            type: 'subscription_expiring',
            title: 'Subscription expiring soon',
            message: `Your ${subscription.plan.name} plan ends on ${formatDate(subscription.billingCycleEnd)}. Renew to keep making changes.`,
            link: '/dashboard/subscriptions',
          });
        }
        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: { expiryReminderSentAt: new Date() },
        });
      } catch (error) {
        this.logger.error(`Failed to send subscription expiry notice`, error);
      }
    }

    this.logger.log(
      `Sent ${subscriptions.length} subscription expiry notice(s)`,
    );
    return subscriptions.length;
  }

  @Cron('0 10 * * *', { ...cronOptions, name: 'expire-subscriptions' })
  async checkExpiredSubscriptions() {
    const expired = await this.prisma.subscription.findMany({
      where: { status: 'active', billingCycleEnd: { lt: new Date() } },
      select: { id: true, userId: true, plan: { select: { name: true } } },
    });

    for (const subscription of expired) {
      try {
        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: 'expired' },
        });
        const user = await this.prisma.user.findFirst({
          where: { id: subscription.userId, deletedAt: null },
          select: { name: true, email: true },
        });
        if (!user) continue;
        await this.emailService.sendSubscriptionExpiredEmail(
          user.email,
          user.name,
          subscription.plan.name,
        );
        await this.notificationsService.create({
          userId: subscription.userId,
          userType: 'user',
          type: 'subscription_expired',
          title: 'Subscription expired',
          message: `Your ${subscription.plan.name} plan has expired. Your account is read-only until you activate a plan.`,
          link: '/dashboard/subscriptions',
        });
      } catch (error) {
        this.logger.error(`Failed to process expired subscription`, error);
      }
    }

    this.logger.log(`Expired ${expired.length} subscription(s)`);
    return expired.length;
  }

  // ========== HOUSEKEEPING ==========

  @Cron(CronExpression.EVERY_DAY_AT_2AM, {
    ...cronOptions,
    name: 'purge-deleted-owners',
  })
  async purgeDeletedUsers() {
    const purged = await this.userDeletionService.purgeExpiredUsers();
    this.logger.log(`Purged ${purged} owner account(s)`);
    return purged;
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    ...cronOptions,
    name: 'cleanup-otps',
  })
  async cleanupOtps() {
    const removed = await this.tokenService.deleteExpiredOTPs();
    this.logger.log(`Removed ${removed} used/expired OTP(s)`);
    return removed;
  }
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}
