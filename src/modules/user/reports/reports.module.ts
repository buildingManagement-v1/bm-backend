import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { ReportsPortfolioController } from './reports-portfolio.controller';

@Module({
  providers: [ReportsService],
  controllers: [ReportsController, ReportsPortfolioController],
})
export class ReportsModule {}
