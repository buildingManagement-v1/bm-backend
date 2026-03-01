import { Module } from '@nestjs/common';
import { ParkingRequestsService } from './parking-requests.service';
import { ParkingRequestsController } from './parking-requests.controller';
import { ParkingModule } from '../parking/parking.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { NotificationsModule } from '../../../common/notifications/notifications.module';

@Module({
  imports: [ParkingModule, PrismaModule, NotificationsModule],
  providers: [ParkingRequestsService],
  controllers: [ParkingRequestsController],
})
export class ParkingRequestsModule {}
