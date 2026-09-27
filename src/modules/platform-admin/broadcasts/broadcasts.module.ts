import { Module } from '@nestjs/common';
import { FirebaseModule } from 'src/common/firebase/firebase.module';
import { ActivityLogsModule } from 'src/modules/user/activity-logs/activity-logs.module';
import { BroadcastsController } from './broadcasts.controller';
import { BroadcastsService } from './broadcasts.service';

@Module({
  imports: [ActivityLogsModule, FirebaseModule],
  providers: [BroadcastsService],
  controllers: [BroadcastsController],
})
export class BroadcastsModule {}
