import { Controller, Get, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { BuildingAccessGuard } from '../../../common/guards/building-access.guard';
import { BuildingId } from '../../../common/decorators/building-id.decorator';
import { SubscriptionGuard } from 'src/common/guards/subscription.guard';

@Controller('v1/app/dashboard')
@UseGuards(JwtAuthGuard, BuildingAccessGuard, SubscriptionGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  async getStats(@BuildingId() buildingId: string) {
    const result = await this.dashboardService.getStats(buildingId);
    return { success: true, data: result };
  }

  @Get('upcoming-payments')
  async getUpcomingPayments(@BuildingId() buildingId: string) {
    const result = await this.dashboardService.getUpcomingPayments(buildingId);
    return { success: true, data: result };
  }
}
