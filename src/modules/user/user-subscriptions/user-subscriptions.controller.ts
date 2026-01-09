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
}
