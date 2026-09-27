import { Module } from '@nestjs/common';
import { UserSubscriptionsController } from './user-subscriptions.controller';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { BillingModule } from 'src/modules/billing/billing.module';

@Module({
  imports: [SubscriptionsModule, BillingModule],
  controllers: [UserSubscriptionsController],
})
export class UserSubscriptionsModule {}
