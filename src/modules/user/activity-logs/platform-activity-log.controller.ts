import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import {
  ActivityAction,
  ActivityEntityType,
  PlatformAdminRole,
} from 'generated/prisma/client';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { ActivityLogsService } from './activity-logs.service';

@ApiTags('Platform Activity Logs')
@ApiBearerAuth()
@Controller('v1/platform/activity-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(PlatformAdminRole.super_admin, PlatformAdminRole.system_manager)
export class PlatformActivityLogsController {
  constructor(private readonly activityLogsService: ActivityLogsService) {}

  @Get()
  @ApiOperation({ summary: 'Get platform activity logs' })
  @ApiResponse({ status: 200, description: 'Return platform activity logs' })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'entityType', required: false, enum: ActivityEntityType })
  @ApiQuery({ name: 'action', required: false, enum: ActivityAction })
  async findAll(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('entityType') entityType?: ActivityEntityType,
    @Query('action') action?: ActivityAction,
  ) {
    const result = await this.activityLogsService.findAllPlatform({
      startDate,
      endDate,
      entityType,
      action,
    });
    return { success: true, data: result };
  }
}
