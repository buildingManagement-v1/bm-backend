import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ManagerRole } from 'generated/prisma/client';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { BuildingAccessGuard } from 'src/common/guards/building-access.guard';
import { ManagerRolesGuard } from 'src/common/guards/manager-roles.guard';
import { RequireManagerRoles } from 'src/common/decorators/require-manager-roles.decorator';
import { BuildingId } from 'src/common/decorators/building-id.decorator';
import { SubscriptionGuard } from 'src/common/guards/subscription.guard';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('v1/app/reports')
@UseGuards(JwtAuthGuard, BuildingAccessGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('occupancy')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.reports_viewer)
  @ApiOperation({ summary: 'Get occupancy report' })
  @ApiResponse({ status: 200, description: 'Return occupancy report' })
  async getOccupancy(@BuildingId() buildingId: string) {
    const result = await this.reportsService.getOccupancy(buildingId);
    return { success: true, data: result };
  }

  @Get('revenue')
  @UseGuards(ManagerRolesGuard, SubscriptionGuard)
  @RequireManagerRoles(ManagerRole.reports_viewer)
  @ApiOperation({ summary: 'Get revenue report' })
  @ApiResponse({ status: 200, description: 'Return revenue report' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  async getRevenue(
    @BuildingId() buildingId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const result = await this.reportsService.getRevenue(
      buildingId,
      startDate,
      endDate,
    );
    return { success: true, data: result };
  }

  @Get('tenants')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.reports_viewer)
  @ApiOperation({ summary: 'Get tenants report' })
  @ApiResponse({ status: 200, description: 'Return tenants report' })
  async getTenants(@BuildingId() buildingId: string) {
    const result = await this.reportsService.getTenants(buildingId);
    return { success: true, data: result };
  }
}
