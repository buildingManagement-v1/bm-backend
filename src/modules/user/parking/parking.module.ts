import { Module } from '@nestjs/common';
import { ParkingService } from './parking.service';
import { ParkingController } from './parking.controller';
import { NotificationsModule } from '../../../common/notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [ParkingService],
  controllers: [ParkingController],
  exports: [ParkingService],
})
export class ParkingModule {}
