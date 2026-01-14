import { Global, Module } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { EmailModule } from '../email/email.module';

@Global()
@Module({
  imports: [PrismaModule, EmailModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
