import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { isFreePlan } from 'src/common/plan-limits/free-plan.util';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreatePlanDto, UpdatePlanDto } from './dto';
import { ActivityLogsService } from 'src/modules/user/activity-logs/activity-logs.service';
import { Prisma } from 'generated/prisma/client';

@Injectable()
export class PlansService {
  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
  ) {}

  async create(dto: CreatePlanDto, adminId: string, adminName: string) {
    const existing = await this.prisma.subscriptionPlan.findUnique({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException('Plan name already exists');
    }

    const plan = await this.prisma.subscriptionPlan.create({
      data: {
        name: dto.name.trim(),
        price: dto.price,
        features: { premiumFeatures: [], ...dto.features } as object,
        type: dto.type,
      },
    });

    await this.activityLogsService.createPlatformLog({
      action: 'create',
      entityType: 'subscription_plan',
      entityId: plan.id,
      adminId,
      adminName,
      details: {
        name: plan.name,
        price: Number(plan.price),
      } as Prisma.InputJsonValue,
    });

    return plan;
  }

  async findAll() {
    const plans = await this.prisma.subscriptionPlan.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return plans;
  }

  async findAllActive() {
    const plans = await this.prisma.subscriptionPlan.findMany({
      where: { status: 'active', type: 'public' },
      orderBy: { price: 'asc' },
    });
    return plans;
  }

  async findOne(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    return plan;
  }

  async update(
    id: string,
    dto: UpdatePlanDto,
    adminId: string,
    adminName: string,
  ) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    if (dto.name && dto.name !== plan.name) {
      const existing = await this.prisma.subscriptionPlan.findUnique({
        where: { name: dto.name },
      });

      if (existing) {
        throw new ConflictException('Plan name already exists');
      }
    }

    // Registration depends on the Free trial plan staying as it is
    if (isFreePlan(plan)) {
      const changesFree =
        (dto.name !== undefined && dto.name.trim().toLowerCase() !== 'free') ||
        (dto.price !== undefined && dto.price !== 0) ||
        dto.status === 'inactive' ||
        dto.type === 'custom';
      if (changesFree) {
        throw new BadRequestException(
          'The Free plan is the new-owner trial: only its limits can be changed',
        );
      }
    }

    // Lowering limits doesn't touch owners already over them: they keep
    // what they have but can't add more until they're back under the limit
    const updated = await this.prisma.subscriptionPlan.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.features && {
          features: { premiumFeatures: [], ...dto.features } as object,
        }),
      },
    });

    await this.activityLogsService.createPlatformLog({
      action: 'update',
      entityType: 'subscription_plan',
      entityId: updated.id,
      adminId,
      adminName,
      details: {
        changes: {
          name: dto.name,
          price: dto.price ? Number(dto.price) : undefined,
          features: dto.features,
          status: dto.status,
        },
      } as Prisma.InputJsonValue,
    });

    return updated;
  }

  async remove(id: string, adminId: string, adminName: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    if (isFreePlan(plan)) {
      throw new BadRequestException(
        'The Free plan is the new-owner trial and cannot be deleted',
      );
    }

    const [subscriptions, requests] = await Promise.all([
      this.prisma.subscription.count({ where: { planId: id } }),
      this.prisma.subscriptionRequest.count({ where: { planId: id } }),
    ]);
    if (subscriptions + requests > 0) {
      throw new ConflictException(
        'This plan has subscription history. Deactivate it instead of deleting.',
      );
    }

    await this.prisma.subscriptionPlan.delete({
      where: { id },
    });

    await this.activityLogsService.createPlatformLog({
      action: 'delete',
      entityType: 'subscription_plan',
      entityId: id,
      adminId,
      adminName,
      details: { name: plan.name } as Prisma.InputJsonValue,
    });

    return { message: 'Plan deleted successfully' };
  }
}
