import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppUserGuard } from 'src/common/guards/user-type.guards';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('v1/app/reports')
@UseGuards(JwtAuthGuard, AppUserGuard)
export class ReportsPortfolioController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('portfolio')
  // Spans buildings, so the per-building role check happens in the service:
  // managers only get buildings where they are reports viewers
  @ApiOperation({ summary: 'Get portfolio summary (all buildings)' })
  @ApiResponse({ status: 200, description: 'Return portfolio' })
  async getPortfolio(@User() user: { id: string; role: string }) {
    const result = await this.reportsService.getPortfolio(user.id, user.role);
    return { success: true, data: result };
  }
}
