import { Module } from '@nestjs/common';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { ActivityLogsModule } from 'src/modules/user/activity-logs/activity-logs.module';

@Module({
  imports: [ActivityLogsModule],
  providers: [PlansService],
  controllers: [PlansController],
  exports: [PlansService],
})
export class PlansModule {}
