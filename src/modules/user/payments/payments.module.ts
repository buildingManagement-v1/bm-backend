import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { PdfModule } from 'src/common/pdf/pdf.module';
import { NotificationsModule } from 'src/common/notifications/notifications.module';

@Module({
  imports: [ActivityLogsModule, PdfModule, NotificationsModule],
  providers: [PaymentsService],
  controllers: [PaymentsController],
  exports: [PaymentsService],
})
export class PaymentsModule {}
