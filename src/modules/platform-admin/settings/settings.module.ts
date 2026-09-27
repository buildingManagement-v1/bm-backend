import { Global, Module } from '@nestjs/common';
import { ActivityLogsModule } from 'src/modules/user/activity-logs/activity-logs.module';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Global()
@Module({
  imports: [ActivityLogsModule],
  providers: [SettingsService],
  controllers: [SettingsController],
  exports: [SettingsService],
})
export class SettingsModule {}
