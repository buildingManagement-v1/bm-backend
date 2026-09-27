import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { whereActive } from '../soft-delete/soft-delete.scope';
import { parsePlanFeatures } from '../types/plan-features.interface';

@Injectable()
export class PlanLimitsService {
  constructor(private prisma: PrismaService) {}

  async canCreateBuilding(userId: string): Promise<void> {
    const subscription = await this.getActiveSubscription(userId);
    const features = parsePlanFeatures(subscription.plan.features);

    const currentCount = await this.prisma.building.count({
      where: whereActive({ userId, status: 'active' as const }),
    });

    if (currentCount >= features.maxBuildings) {
      throw new BadRequestException(
        `Building limit reached. Your plan allows ${features.maxBuildings} building(s). Upgrade to add more.`,
      );
    }
  }

  async canCreateUnit(buildingId: string): Promise<void> {
    const building = await this.prisma.building.findFirst({
      where: whereActive({ id: buildingId }),
    });

    if (!building) {
      throw new BadRequestException('Building not found');
    }

    const subscription = await this.getActiveSubscription(building.userId);
    const features = parsePlanFeatures(subscription.plan.features);

    const currentCount = await this.prisma.unit.count({
      where: whereActive({ buildingId, status: { not: 'inactive' as const } }),
    });

    if (currentCount >= features.maxUnits) {
      throw new BadRequestException(
        `Unit limit reached for this building. Your plan allows ${features.maxUnits} units per building. Upgrade to add more.`,
      );
    }
  }

  async canCreateManager(userId: string): Promise<void> {
    const subscription = await this.getActiveSubscription(userId);
    const features = parsePlanFeatures(subscription.plan.features);

    const currentCount = await this.prisma.manager.count({
      where: whereActive({ userId, status: 'active' as const }),
    });

    if (currentCount >= features.maxManagers) {
      throw new BadRequestException(
        `Manager limit reached. Your plan allows ${features.maxManagers} manager(s). Upgrade to add more.`,
      );
    }
  }

  async canAccessFeature(
    userId: string,
    featureName: string,
  ): Promise<boolean> {
    const subscription = await this.getActiveSubscription(userId);
    const features = parsePlanFeatures(subscription.plan.features);

    return features.premiumFeatures.includes(featureName);
  }

  /**
   * Ways the owner's current usage exceeds a plan's limits (empty when it
   * fits). Used before switching an owner to a smaller plan.
   */
  async usageViolations(
    userId: string,
    rawFeatures: unknown,
  ): Promise<string[]> {
    const features = parsePlanFeatures(rawFeatures);
    const buildings = await this.prisma.building.findMany({
      where: whereActive({ userId, status: 'active' as const }),
      select: {
        name: true,
        _count: {
          select: {
            units: {
              where: { deletedAt: null, status: { not: 'inactive' as const } },
            },
          },
        },
      },
    });
    const managers = await this.prisma.manager.count({
      where: whereActive({ userId, status: 'active' as const }),
    });

    const violations: string[] = [];
    if (buildings.length > features.maxBuildings) {
      violations.push(
        `You have ${buildings.length} buildings; this plan allows ${features.maxBuildings}.`,
      );
    }
    for (const b of buildings) {
      if (b._count.units > features.maxUnits) {
        violations.push(
          `${b.name} has ${b._count.units} active units; this plan allows ${features.maxUnits} per building.`,
        );
      }
    }
    if (managers > features.maxManagers) {
      violations.push(
        `You have ${managers} active managers; this plan allows ${features.maxManagers}.`,
      );
    }
    return violations;
  }

  private async getActiveSubscription(userId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { userId, status: 'active', billingCycleEnd: { gte: new Date() } },
      include: { plan: true },
    });

    if (!subscription) {
      throw new BadRequestException(
        'No active subscription. Activate a plan to add more.',
      );
    }

    return subscription;
  }
}
