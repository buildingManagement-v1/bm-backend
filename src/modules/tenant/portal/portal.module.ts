import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { ActivityLogsModule } from '../../user/activity-logs/activity-logs.module';

@Module({
  imports: [PrismaModule, ActivityLogsModule],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
