import { Module } from '@nestjs/common';
import { ActivityLogsModule } from '../activity-logs/activity-logs.module';
import {
  AnnouncementsController,
  TenantAnnouncementsController,
} from './announcements.controller';
import { AnnouncementsService } from './announcements.service';

@Module({
  imports: [ActivityLogsModule],
  providers: [AnnouncementsService],
  controllers: [AnnouncementsController, TenantAnnouncementsController],
})
export class AnnouncementsModule {}
