import { Module } from '@nestjs/common';
import { MaintenanceRequestsService } from './maintenance-requests.service';
import { MaintenanceRequestsController } from './maintenance-requests.controller';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import { NotificationsModule } from 'src/common/notifications/notifications.module';

@Module({
  imports: [ActivityLogsModule, NotificationsModule],
  providers: [MaintenanceRequestsService],
  controllers: [MaintenanceRequestsController],
})
export class MaintenanceRequestsModule {}
