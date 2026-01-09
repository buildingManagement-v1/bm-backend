import { Module } from '@nestjs/common';
import { UserSubscriptionsController } from './user-subscriptions.controller';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PlansModule } from 'src/modules/platform-admin/plans/plans.module';

@Module({
  imports: [SubscriptionsModule, PlansModule],
  controllers: [UserSubscriptionsController],
})
export class UserSubscriptionsModule {}
