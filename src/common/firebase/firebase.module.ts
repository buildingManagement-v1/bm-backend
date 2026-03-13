import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PushNotificationService } from './push-notification.service';
import { DeviceTokenModule } from '../device-token/device-token.module';

@Module({
  imports: [ConfigModule, DeviceTokenModule],
  providers: [PushNotificationService],
  exports: [PushNotificationService],
})
export class FirebaseModule {}
