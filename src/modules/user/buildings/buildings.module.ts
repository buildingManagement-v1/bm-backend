import { Module } from '@nestjs/common';
import { BuildingsService } from './buildings.service';
import { BuildingsController } from './buildings.controller';
import { PlanLimitsModule } from 'src/common/plan-limits/plan-limits.module';

@Module({
  imports: [PlanLimitsModule],
  controllers: [BuildingsController],
  providers: [BuildingsService],
})
export class BuildingsModule {}
