import { Module } from '@nestjs/common';
import { ManagersService } from './managers.service';
import { ManagersController } from './managers.controller';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { PlanLimitsModule } from 'src/common/plan-limits/plan-limits.module';

@Module({
  imports: [ActivityLogsModule, PlanLimitsModule],
  controllers: [ManagersController],
  providers: [ManagersService],
})
export class ManagersModule {}
