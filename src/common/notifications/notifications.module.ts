import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { ActivityLogsModule } from '../../modules/user/activity-logs/activity-logs.module';

@Global()
@Module({
  imports: [PrismaModule, ActivityLogsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
