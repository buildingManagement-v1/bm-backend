import { PlanLimitsModule } from 'src/common/plan-limits/plan-limits.module';
import { Module } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { ActivityLogsModule } from 'src/modules/user/activity-logs/activity-logs.module';
import { PdfModule } from 'src/common/pdf/pdf.module';

@Module({
  imports: [ActivityLogsModule, PdfModule, PlanLimitsModule],
  providers: [SubscriptionsService],
  controllers: [SubscriptionsController],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
