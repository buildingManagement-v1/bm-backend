import { Module } from '@nestjs/common';
import { PaymentRequestsService } from './payment-requests.service';
import { PaymentRequestsController } from './payment-requests.controller';
import { PaymentsModule } from '../payments/payments.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { NotificationsModule } from '../../../common/notifications/notifications.module';

@Module({
  imports: [PaymentsModule, PrismaModule, NotificationsModule],
  providers: [PaymentRequestsService],
  controllers: [PaymentRequestsController],
})
export class PaymentRequestsModule {}
