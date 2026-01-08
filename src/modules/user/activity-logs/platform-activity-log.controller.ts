import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ActivityAction,
  ActivityEntityType,
  PlatformAdminRole,
} from 'generated/prisma/client';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { ActivityLogsService } from './activity-logs.service';

@Controller('v1/platform/activity-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(PlatformAdminRole.super_admin, PlatformAdminRole.system_manager)
export class PlatformActivityLogsController {
  constructor(private readonly activityLogsService: ActivityLogsService) {}

  @Get()
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
