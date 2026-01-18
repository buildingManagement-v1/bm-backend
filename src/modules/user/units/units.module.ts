import { Module } from '@nestjs/common';
import { UnitsService } from './units.service';
import { UnitsController } from './units.controller';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { PlanLimitsModule } from 'src/common/plan-limits/plan-limits.module';

@Module({
  imports: [ActivityLogsModule, PlanLimitsModule],
  controllers: [UnitsController],
  providers: [UnitsService],
})
export class UnitsModule {}
