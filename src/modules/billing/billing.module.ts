import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { AdminBillingController } from './admin-billing.controller';
import { PlanLimitsModule } from 'src/common/plan-limits/plan-limits.module';
import { PdfModule } from 'src/common/pdf/pdf.module';
import { ActivityLogsModule } from 'src/modules/user/activity-logs/activity-logs.module';

@Module({
  imports: [PlanLimitsModule, PdfModule, ActivityLogsModule],
  providers: [BillingService],
  controllers: [AdminBillingController],
  exports: [BillingService],
})
export class BillingModule {}
