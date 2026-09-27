import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppUserGuard } from 'src/common/guards/user-type.guards';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ManagerRole } from 'generated/prisma/client';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RequireManagerRoles } from 'src/common/decorators/require-manager-roles.decorator';
import { User } from 'src/common/decorators/user.decorator';

@ApiTags('Reports')
@ApiBearerAuth()
@Controller('v1/app/reports')
@UseGuards(JwtAuthGuard, AppUserGuard)
@RequireManagerRoles(ManagerRole.reports_viewer)
export class ReportsPortfolioController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('portfolio')
  @ApiOperation({ summary: 'Get portfolio summary (all buildings)' })
  @ApiResponse({ status: 200, description: 'Return portfolio' })
  async getPortfolio(@User() user: { id: string; role: string }) {
    const result = await this.reportsService.getPortfolio(user.id, user.role);
    return { success: true, data: result };
  }
}
