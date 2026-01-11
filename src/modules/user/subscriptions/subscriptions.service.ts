import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateSubscriptionDto, UpdateSubscriptionDto } from './dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { Prisma } from 'generated/prisma/client';
import { PdfService } from 'src/common/pdf/pdf.service';

@Injectable()
export class SubscriptionsService {
  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
    private pdfService: PdfService,
  ) {}

  async create(dto: CreateSubscriptionDto, adminId: string, adminName: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id: dto.planId },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    if (plan.status !== 'active') {
      throw new BadRequestException('Plan is not active');
    }

    const existingSubscription = await this.prisma.subscription.findFirst({
      where: {
        userId: dto.userId,
        status: 'active',
      },
    });

    if (existingSubscription) {
      throw new BadRequestException('User already has an active subscription');
    }

    const totalAmount = this.calculateBilling(
      dto.buildingCount,
      dto.managerCount,
      Number(plan.buildingPrice),
      Number(plan.managerPrice),
    );

    const billingCycleStart = new Date(dto.billingCycleStart);
    const billingCycleEnd = new Date(billingCycleStart);
    billingCycleEnd.setFullYear(billingCycleEnd.getFullYear() + 1);
    const nextBillingDate = new Date(billingCycleEnd);

    const subscription = await this.prisma.subscription.create({
      data: {
        userId: dto.userId,
        planId: dto.planId,
        buildingCount: dto.buildingCount,
        managerCount: dto.managerCount,
        totalAmount,
        billingCycleStart,
        billingCycleEnd,
        nextBillingDate,
        status: 'active',
      },
      include: {
        plan: true,
      },
    });

    await this.prisma.subscriptionHistory.create({
      data: {
        userId: dto.userId,
        subscriptionId: subscription.id,
        action: 'created',
        newPlanId: dto.planId,
        newBuildingCount: dto.buildingCount,
        newManagerCount: dto.managerCount,
      },
    });

    await this.activityLogsService.createPlatformLog({
      action: 'create',
      entityType: 'subscription_plan',
      entityId: subscription.id,
      adminId,
      adminName,
      details: {
        userId: dto.userId,
        planName: plan.name,
        buildingCount: dto.buildingCount,
        managerCount: dto.managerCount,
        totalAmount: Number(totalAmount),
      } as Prisma.InputJsonValue,
    });

    return {
      success: true,
      data: subscription,
      message: 'Subscription created successfully',
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

  async findAllSubscriptions() {
    const subscriptions = await this.prisma.subscription.findMany({
      include: {
        plan: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const subscriptionsWithUsers = await Promise.all(
      subscriptions.map(async (sub) => {
        const user = await this.prisma.user.findUnique({
          where: { id: sub.userId },
          select: { name: true, email: true },
        });
        return { ...sub, user };
      }),
    );

    return {
      success: true,
      data: subscriptionsWithUsers,
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

    const updated = await this.prisma.subscription.update({
      where: { id },
      data: dto,
      include: {
        plan: true,
      },
    });

    await this.activityLogsService.createPlatformLog({
      action: 'update',
      entityType: 'subscription_plan',
      entityId: id,
      adminId,
      adminName,
      details: {
        userId: subscription.userId,
        changes: { status: dto.status },
      } as Prisma.InputJsonValue,
    });

    return {
      success: true,
      data: updated,
      message: 'Subscription updated successfully',
    };
  }

  async calculateUpgradeProrating(
    subscriptionId: string,
    newPlanId: string,
    newBuildingCount: number,
    newManagerCount: number,
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

    const newTotal = this.calculateBilling(
      newBuildingCount,
      newManagerCount,
      Number(newPlan.buildingPrice),
      Number(newPlan.managerPrice),
    );
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
    newBuildingCount: number,
    newManagerCount: number,
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

    const newTotal = this.calculateBilling(
      newBuildingCount,
      newManagerCount,
      Number(newPlan.buildingPrice),
      Number(newPlan.managerPrice),
    );
    const newCost = newTotal * (daysLeft / totalDays);
    const proratedAmount = newCost - oldUnused;

    const updated = await this.prisma.subscription.update({
      where: { id: subscriptionId },
      data: {
        planId: newPlanId,
        buildingCount: newBuildingCount,
        managerCount: newManagerCount,
        totalAmount: newTotal,
      },
      include: { plan: true },
    });

    await this.prisma.subscriptionHistory.create({
      data: {
        userId: subscription.userId,
        subscriptionId: subscription.id,
        action: 'upgraded',
        oldPlanId: subscription.planId,
        newPlanId: newPlanId,
        oldBuildingCount: subscription.buildingCount,
        newBuildingCount: newBuildingCount,
        oldManagerCount: subscription.managerCount,
        newManagerCount: newManagerCount,
        proratedAmount,
        notes: `Upgraded from ${subscription.plan.name} to ${newPlan.name}. Days remaining: ${daysLeft}`,
      },
    });

    await this.activityLogsService.createPlatformLog({
      action: 'update',
      entityType: 'subscription_plan',
      entityId: subscriptionId,
      adminId,
      adminName,
      details: {
        type: 'upgrade',
        oldPlan: subscription.plan.name,
        newPlan: newPlan.name,
        proratedAmount: Number(proratedAmount.toFixed(2)),
        daysRemaining: daysLeft,
      } as Prisma.InputJsonValue,
    });

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
      message: 'Subscription upgraded successfully',
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
      buildingCount: subscription.buildingCount,
      managerCount: subscription.managerCount,
      buildingPrice: Number(subscription.plan.buildingPrice),
      managerPrice: Number(subscription.plan.managerPrice),
      totalAmount: Number(subscription.totalAmount),
      billingPeriod: {
        start: subscription.billingCycleStart,
        end: subscription.billingCycleEnd,
      },
    });
  }

  private calculateBilling(
    buildingCount: number,
    managerCount: number,
    buildingPrice: number,
    managerPrice: number,
  ): number {
    return buildingCount * buildingPrice + managerCount * managerPrice;
  }
}
