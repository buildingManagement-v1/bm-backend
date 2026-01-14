import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private notificationsService: NotificationsService,
  ) {}

  // ========== SUBSCRIPTIONS ==========

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async checkExpiringSubscriptions() {
    this.logger.log('Checking for expiring subscriptions...');

    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const expiringSubscriptions = await this.prisma.subscription.findMany({
      where: {
        status: 'active',
        billingCycleEnd: {
          gte: new Date(),
          lte: sevenDaysFromNow,
        },
      },
      select: {
        id: true,
        userId: true,
        billingCycleEnd: true,
        plan: {
          select: { name: true },
        },
      },
    });

    for (const subscription of expiringSubscriptions) {
      try {
        const user = await this.prisma.user.findUnique({
          where: { id: subscription.userId },
          select: { name: true, email: true },
        });

        if (!user) continue;

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
          title: 'Subscription Expiring Soon',
          message: `Your ${subscription.plan.name} subscription will expire on ${subscription.billingCycleEnd.toLocaleDateString()}`,
          link: '/dashboard/subscriptions',
        });
        this.logger.log(`Sent expiring email to ${user.email}`);
      } catch (error) {
        this.logger.error(`Failed to send expiring email`, error);
      }
    }

    this.logger.log(
      `Processed ${expiringSubscriptions.length} expiring subscriptions`,
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_10AM)
  async checkExpiredSubscriptions() {
    this.logger.log('Checking for expired subscriptions...');

    const expiredSubscriptions = await this.prisma.subscription.findMany({
      where: {
        status: 'active',
        billingCycleEnd: {
          lt: new Date(),
        },
      },
      select: {
        id: true,
        userId: true,
        plan: {
          select: { name: true },
        },
      },
    });

    for (const subscription of expiredSubscriptions) {
      try {
        const user = await this.prisma.user.findUnique({
          where: { id: subscription.userId },
          select: { name: true, email: true },
        });

        if (!user) continue;

        await this.prisma.subscription.update({
          where: { id: subscription.id },
          data: { status: 'expired' },
        });

        await this.emailService.sendSubscriptionExpiredEmail(
          user.email,
          user.name,
          subscription.plan.name,
        );

        await this.notificationsService.create({
          userId: subscription.userId,
          userType: 'user',
          type: 'subscription_expired',
          title: 'Subscription Expired',
          message: `Your ${subscription.plan.name} subscription has expired`,
          link: '/dashboard/subscriptions',
        });

        this.logger.log(`Expired and notified ${user.email}`);
      } catch (error) {
        this.logger.error(`Failed to process expired subscription`, error);
      }
    }

    this.logger.log(
      `Processed ${expiredSubscriptions.length} expired subscriptions`,
    );
  }

  // ========== LEASES ==========

  @Cron(CronExpression.EVERY_DAY_AT_11AM)
  async checkExpiringLeases() {
    this.logger.log('Checking for expiring leases...');

    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringLeases = await this.prisma.lease.findMany({
      where: {
        status: 'active',
        endDate: {
          gte: new Date(),
          lte: thirtyDaysFromNow,
        },
      },
      select: {
        id: true,
        endDate: true,
        tenant: {
          select: { name: true, email: true },
        },
        unit: {
          select: { unitNumber: true },
        },
      },
    });

    for (const lease of expiringLeases) {
      try {
        await this.emailService.sendLeaseExpiringEmail(
          lease.tenant.email,
          lease.tenant.name,
          lease.unit.unitNumber,
          lease.endDate,
        );
        this.logger.log(`Sent lease expiring email to ${lease.tenant.email}`);
      } catch (error) {
        this.logger.error(`Failed to send lease expiring email`, error);
      }
    }

    this.logger.log(`Processed ${expiringLeases.length} expiring leases`);
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkExpiredLeases() {
    this.logger.log('Checking for expired leases...');

    const expiredLeases = await this.prisma.lease.findMany({
      where: {
        status: 'active',
        endDate: {
          lt: new Date(),
        },
      },
      select: {
        id: true,
        tenant: {
          select: { name: true, email: true },
        },
        unit: {
          select: { unitNumber: true },
        },
      },
    });

    for (const lease of expiredLeases) {
      try {
        await this.prisma.lease.update({
          where: { id: lease.id },
          data: { status: 'expired' },
        });

        await this.emailService.sendLeaseExpiredEmail(
          lease.tenant.email,
          lease.tenant.name,
          lease.unit.unitNumber,
        );

        this.logger.log(`Expired and notified lease for ${lease.tenant.email}`);
      } catch (error) {
        this.logger.error(`Failed to process expired lease`, error);
      }
    }

    this.logger.log(`Processed ${expiredLeases.length} expired leases`);
  }

  // ========== INVOICES / PAYMENTS ==========

  @Cron(CronExpression.EVERY_DAY_AT_8AM)
  async checkOverduePayments() {
    this.logger.log('Checking for overdue payments...');

    const overdueInvoices = await this.prisma.invoice.findMany({
      where: {
        status: {
          in: ['draft', 'sent', 'overdue'],
        },
        dueDate: {
          lt: new Date(),
        },
      },
      select: {
        id: true,
        invoiceNumber: true,
        amount: true,
        dueDate: true,
        status: true,
        tenant: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    for (const invoice of overdueInvoices) {
      try {
        if (invoice.status !== 'overdue') {
          await this.prisma.invoice.update({
            where: { id: invoice.id },
            data: { status: 'overdue' },
          });
        }

        await this.emailService.sendPaymentOverdueEmail(
          invoice.tenant.email,
          invoice.tenant.name,
          invoice.invoiceNumber,
          Number(invoice.amount),
          invoice.dueDate,
        );

        await this.notificationsService.create({
          userId: invoice.tenant.id,
          userType: 'tenant',
          type: 'invoice_overdue',
          title: 'Payment Overdue',
          message: `Your payment of $${Number(invoice.amount).toFixed(2)} is overdue. Invoice: ${invoice.invoiceNumber}`,
          link: '/tenant/payments',
        });

        this.logger.log(
          `Sent overdue payment email to ${invoice.tenant.email}`,
        );
      } catch (error) {
        this.logger.error(`Failed to send overdue email`, error);
      }
    }

    this.logger.log(`Processed ${overdueInvoices.length} overdue payments`);
  }

  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendPaymentReminders() {
    this.logger.log('Sending payment reminders...');

    const fiveDaysFromNow = new Date();
    fiveDaysFromNow.setDate(fiveDaysFromNow.getDate() + 5);

    const upcomingInvoices = await this.prisma.invoice.findMany({
      where: {
        status: {
          in: ['draft', 'sent'],
        },
        dueDate: {
          gte: new Date(),
          lte: fiveDaysFromNow,
        },
      },
      select: {
        id: true,
        invoiceNumber: true,
        amount: true,
        dueDate: true,
        tenant: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    for (const invoice of upcomingInvoices) {
      try {
        await this.emailService.sendPaymentReminderEmail(
          invoice.tenant.email,
          invoice.tenant.name,
          invoice.invoiceNumber,
          Number(invoice.amount),
          invoice.dueDate,
        );

        await this.notificationsService.create({
          userId: invoice.tenant.id,
          userType: 'tenant',
          type: 'invoice_created',
          title: 'Payment Reminder',
          message: `Payment of $${Number(invoice.amount).toFixed(2)} is due soon. Invoice: ${invoice.invoiceNumber}`,
          link: '/tenant/payments',
        });
        this.logger.log(`Sent payment reminder to ${invoice.tenant.email}`);
      } catch (error) {
        this.logger.error(`Failed to send payment reminder`, error);
      }
    }

    this.logger.log(`Processed ${upcomingInvoices.length} payment reminders`);
  }
}
