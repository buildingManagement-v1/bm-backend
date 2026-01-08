import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ActivityLogsService } from './activity-logs.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { BuildingAccessGuard } from '../../../common/guards/building-access.guard';
import { ManagerRolesGuard } from '../../../common/guards/manager-roles.guard';
import { RequireManagerRoles } from '../../../common/decorators/require-manager-roles.decorator';
import { BuildingId } from '../../../common/decorators/building-id.decorator';
import {
  ManagerRole,
  ActivityAction,
  ActivityEntityType,
} from 'generated/prisma/client';

@Controller('v1/app/activity-logs')
@UseGuards(JwtAuthGuard, BuildingAccessGuard)
export class ActivityLogsController {
  constructor(private readonly activityLogsService: ActivityLogsService) {}

  @Get()
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.operations_manager)
  async findAll(
    @BuildingId() buildingId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('entityType') entityType?: ActivityEntityType,
    @Query('action') action?: ActivityAction,
  ) {
    const result = await this.activityLogsService.findAll(buildingId, {
      startDate,
      endDate,
      entityType,
      action,
    });
    return { success: true, data: result };
  }
}
