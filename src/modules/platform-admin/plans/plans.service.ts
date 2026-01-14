import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
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
        name: dto.name,
        buildingPrice: dto.buildingPrice,
        managerPrice: dto.managerPrice,
        features: dto.features,
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
        buildingPrice: Number(plan.buildingPrice),
        managerPrice: Number(plan.managerPrice),
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
      where: { status: 'active' },
      orderBy: { buildingPrice: 'asc' },
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

    const updated = await this.prisma.subscriptionPlan.update({
      where: { id },
      data: dto,
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
          buildingPrice: dto.buildingPrice
            ? Number(dto.buildingPrice)
            : undefined,
          managerPrice: dto.managerPrice ? Number(dto.managerPrice) : undefined,
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
