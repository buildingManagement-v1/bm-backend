import { Global, Module } from '@nestjs/common';
import { SoftDeleteService } from './soft-delete.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [SoftDeleteService],
  exports: [SoftDeleteService],
})
export class SoftDeleteModule {}
