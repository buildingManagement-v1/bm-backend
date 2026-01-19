import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { PdfModule } from 'src/common/pdf/pdf.module';

@Module({
  imports: [ActivityLogsModule, PdfModule],
  providers: [PaymentsService],
  controllers: [PaymentsController],
})
export class PaymentsModule {}
