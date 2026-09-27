import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { AnalyticsService } from './analytics.service';

@ApiTags('Platform Analytics')
@ApiBearerAuth()
@Controller('v1/platform/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @Roles(
    'super_admin',
    'analytics_viewer',
    'billing_manager',
    'user_manager',
    'system_manager',
  )
  @ApiOperation({ summary: 'Platform KPIs for the admin dashboard' })
  async overview() {
    return { success: true, data: await this.analyticsService.overview() };
  }
}
