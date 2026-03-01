import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { BuildingAccessGuard } from '../../../common/guards/building-access.guard';
import { BuildingId } from '../../../common/decorators/building-id.decorator';
import { SubscriptionGuard } from 'src/common/guards/subscription.guard';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('v1/app/dashboard')
@UseGuards(JwtAuthGuard, BuildingAccessGuard, SubscriptionGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard stats' })
  @ApiResponse({ status: 200, description: 'Return dashboard stats' })
  async getStats(@BuildingId() buildingId: string) {
    const result = await this.dashboardService.getStats(buildingId);
    return { success: true, data: result };
  }

  @Get('upcoming-payments')
  @ApiOperation({ summary: 'Get upcoming payments' })
  @ApiResponse({ status: 200, description: 'Return upcoming payments' })
  async getUpcomingPayments(@BuildingId() buildingId: string) {
    const result = await this.dashboardService.getUpcomingPayments(buildingId);
    return { success: true, data: result };
  }

  @Get('revenue-by-month')
  @ApiOperation({ summary: 'Get revenue by month for charts (last 6 months)' })
  @ApiResponse({ status: 200, description: 'Return revenue by month' })
  async getRevenueByMonth(@BuildingId() buildingId: string) {
    const result = await this.dashboardService.getRevenueByMonth(buildingId, 6);
    return { success: true, data: result };
  }
}
