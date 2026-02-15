import { Controller, Get, Query, UseGuards, Res } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import type { Response } from 'express';
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

  @Get('summary')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.reports_viewer)
  @ApiOperation({ summary: 'Get owner summary (KPIs for reports dashboard)' })
  @ApiResponse({ status: 200, description: 'Return summary for current month' })
  async getSummary(@BuildingId() buildingId: string) {
    const result = await this.reportsService.getSummary(buildingId);
    return { success: true, data: result };
  }

  @Get('occupancy')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.reports_viewer)
  @ApiOperation({ summary: 'Get occupancy report (v2: trend, lost rent)' })
  @ApiResponse({ status: 200, description: 'Return occupancy report' })
  @ApiQuery({ name: 'historyMonths', required: false, type: Number })
  async getOccupancy(
    @BuildingId() buildingId: string,
    @Query('historyMonths') historyMonths?: string,
  ) {
    const months = historyMonths ? parseInt(historyMonths, 10) : 6;
    const result = await this.reportsService.getOccupancy(
      buildingId,
      isNaN(months) ? 6 : months,
    );
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

  @Get('maintenance')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.reports_viewer)
  @ApiOperation({ summary: 'Get maintenance report summary' })
  @ApiResponse({ status: 200, description: 'Return maintenance summary' })
  async getMaintenance(@BuildingId() buildingId: string) {
    const result = await this.reportsService.getMaintenance(buildingId);
    return { success: true, data: result };
  }

  @Get('export')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.reports_viewer)
  @ApiOperation({ summary: 'Export report as CSV' })
  @ApiQuery({
    name: 'report',
    required: true,
    enum: ['outstanding', 'expirations', 'vacant'],
  })
  async getExport(
    @BuildingId() buildingId: string,
    @Query('report') report: 'outstanding' | 'expirations' | 'vacant',
    @Res() res: Response,
  ) {
    const csv = await this.reportsService.getExportCsv(buildingId, report);
    const filename = `report-${report}-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
