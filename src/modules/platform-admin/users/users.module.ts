import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaModule } from '../../../prisma/prisma.module';
import { BillingModule } from 'src/modules/billing/billing.module';
import { ActivityLogsModule } from 'src/modules/user/activity-logs/activity-logs.module';

@Module({
  imports: [PrismaModule, BillingModule, ActivityLogsModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
