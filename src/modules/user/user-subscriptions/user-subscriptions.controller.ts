import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { User } from '../../../common/decorators/user.decorator';
import { PlansService } from '../../platform-admin/plans/plans.service';
import { ChangePlanDto } from './dto/change-plan.dto';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

@Controller('v1/app/subscriptions')
@UseGuards(JwtAuthGuard)
export class UserSubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly plansService: PlansService,
  ) {}

  @Get('my-subscription')
  async getMySubscription(@User() user: { id: string; email: string }) {
    const result = await this.subscriptionsService.findAll(user.id);

    // Return only the active subscription
    const activeSubscription = result.data.find(
      (sub) => sub.status === 'active',
    );

    return {
      success: true,
      data: activeSubscription || null,
    };
  }

  @Get('available-plans')
  async getAvailablePlans() {
    const plans = await this.plansService.findAll();

    const activePlans = plans.filter((plan) => plan.status === 'active');

    return {
      success: true,
      data: activePlans,
    };
  }

  @Post('calculate-change')
  async calculatePlanChange(
    @Body() dto: ChangePlanDto,
    @User() user: { id: string; email: string },
  ) {
    // Get user's active subscription
    const subscriptions = await this.subscriptionsService.findAll(user.id);
    const activeSubscription = subscriptions.data.find(
      (sub) => sub.status === 'active',
    );

    if (!activeSubscription) {
      return {
        success: false,
        message: 'No active subscription found',
      };
    }

    // Calculate prorating
    const result = await this.subscriptionsService.calculateUpgradeProrating(
      activeSubscription.id,
      dto.newPlanId,
      dto.newBuildingCount,
      dto.newManagerCount,
    );

    return result;
  }

  @Post('change-plan')
  async changePlan(
    @Body() dto: ChangePlanDto,
    @User() user: { id: string; email: string },
  ) {
    // Get user's active subscription
    const subscriptions = await this.subscriptionsService.findAll(user.id);
    const activeSubscription = subscriptions.data.find(
      (sub) => sub.status === 'active',
    );

    if (!activeSubscription) {
      return {
        success: false,
        message: 'No active subscription found',
      };
    }

    // Execute upgrade/downgrade
    const result = await this.subscriptionsService.upgrade(
      activeSubscription.id,
      dto.newPlanId,
      dto.newBuildingCount,
      dto.newManagerCount,
      user.id,
      `${user.email} (Self-Service)`,
    );

    return result;
  }

  @Post('subscribe-free')
  async subscribeFree(@User() user: { id: string; email: string }) {
    const subscriptions = await this.subscriptionsService.findAll(user.id);
    const activeSubscription = subscriptions.data.find(
      (sub) => sub.status === 'active',
    );

    if (activeSubscription) {
      return {
        success: false,
        message: 'You already have an active subscription',
      };
    }

    // Find Free plan
    const plans = await this.plansService.findAllActive();
    const freePlan = plans.find((plan) => plan.name === 'Free');

    if (!freePlan) {
      return {
        success: false,
        message: 'Free plan not available',
      };
    }

    // Create subscription
    const result = await this.subscriptionsService.create(
      {
        userId: user.id,
        planId: freePlan.id,
        buildingCount: 1,
        managerCount: 1,
        billingCycleStart: new Date().toISOString(),
      },
      user.id,
      user.email,
    );

    return {
      success: true,
      data: result,
      message: 'Successfully subscribed to Free plan',
    };
  }
}
