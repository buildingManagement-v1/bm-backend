import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanFeatures } from '../types/plan-features.interface';

@Injectable()
export class PlanLimitsService {
  constructor(private prisma: PrismaService) {}

  async canCreateBuilding(userId: string): Promise<void> {
    const subscription = await this.getActiveSubscription(userId);
    const features = subscription.plan.features as unknown as PlanFeatures;

    const currentCount = await this.prisma.building.count({
      where: { userId, status: 'active' },
    });

    if (currentCount >= features.maxBuildings) {
      throw new BadRequestException(
        `Building limit reached. Your plan allows ${features.maxBuildings} building(s). Upgrade to add more.`,
      );
    }
  }

  async canCreateUnit(buildingId: string): Promise<void> {
    const building = await this.prisma.building.findUnique({
      where: { id: buildingId },
    });

    if (!building) {
      throw new BadRequestException('Building not found');
    }

    const subscription = await this.getActiveSubscription(building.userId);
    const features = subscription.plan.features as unknown as PlanFeatures;

    const currentCount = await this.prisma.unit.count({
      where: { buildingId, status: { not: 'inactive' } },
    });

    if (currentCount >= features.maxUnits) {
      throw new BadRequestException(
        `Unit limit reached for this building. Your plan allows ${features.maxUnits} units per building. Upgrade to add more.`,
      );
    }
  }

  async canCreateManager(userId: string): Promise<void> {
    const subscription = await this.getActiveSubscription(userId);
    const features = subscription.plan.features as unknown as PlanFeatures;

    const currentCount = await this.prisma.manager.count({
      where: { userId, status: 'active' },
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
    const features = subscription.plan.features as unknown as PlanFeatures;

    return features.premiumFeatures.includes(featureName);
  }

  private async getActiveSubscription(userId: string) {
    const subscription = await this.prisma.subscription.findFirst({
      where: { userId, status: 'active' },
      include: { plan: true },
    });

    if (!subscription) {
      throw new BadRequestException('No active subscription found');
    }

    return subscription;
  }
}
