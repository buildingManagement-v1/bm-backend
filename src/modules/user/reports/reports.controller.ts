import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ManagerRole } from 'generated/prisma/client';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { BuildingAccessGuard } from 'src/common/guards/building-access.guard';
import { ManagerRolesGuard } from 'src/common/guards/manager-roles.guard';
import { RequireManagerRoles } from 'src/common/decorators/require-manager-roles.decorator';
import { BuildingId } from 'src/common/decorators/building-id.decorator';
import { SubscriptionGuard } from 'src/common/guards/subscription.guard';

@Controller('v1/app/reports')
@UseGuards(JwtAuthGuard, BuildingAccessGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('occupancy')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.reports_viewer)
  async getOccupancy(@BuildingId() buildingId: string) {
    const result = await this.reportsService.getOccupancy(buildingId);
    return { success: true, data: result };
  }

  @Get('revenue')
  @UseGuards(ManagerRolesGuard, SubscriptionGuard)
  @RequireManagerRoles(ManagerRole.reports_viewer)
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
  async getTenants(@BuildingId() buildingId: string) {
    const result = await this.reportsService.getTenants(buildingId);
    return { success: true, data: result };
  }
}
