import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { BuildingAccessGuard } from '../../../common/guards/building-access.guard';
import { BuildingId } from '../../../common/decorators/building-id.decorator';
import { SubscriptionGuard } from 'src/common/guards/subscription.guard';
import { ManagerRolesGuard } from '../../../common/guards/manager-roles.guard';
import { RequireManagerRoles } from '../../../common/decorators/require-manager-roles.decorator';
import { User } from '../../../common/decorators/user.decorator';
import { ManagerRole } from 'generated/prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/** Roles that may see rent and revenue figures on the dashboard */
const FINANCE_ROLES: ManagerRole[] = [
  ManagerRole.payment_manager,
  ManagerRole.reports_viewer,
];

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('v1/app/dashboard')
@UseGuards(JwtAuthGuard, BuildingAccessGuard, SubscriptionGuard)
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly prisma: PrismaService,
  ) {}

  /** Every building user sees the stats; revenue is null without a finance role */
  @Get('stats')
  @ApiOperation({ summary: 'Get dashboard stats' })
  @ApiResponse({ status: 200, description: 'Return dashboard stats' })
  async getStats(
    @User() user: { id: string; role: string },
    @BuildingId() buildingId: string,
  ) {
    const includeRevenue = await this.canSeeFinances(user, buildingId);
    const result = await this.dashboardService.getStats(
      buildingId,
      includeRevenue,
    );
    return { success: true, data: result };
  }

  @Get('upcoming-payments')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(...FINANCE_ROLES)
  @ApiOperation({ summary: 'Get upcoming payments' })
  @ApiResponse({ status: 200, description: 'Return upcoming payments' })
  async getUpcomingPayments(@BuildingId() buildingId: string) {
    const result = await this.dashboardService.getUpcomingPayments(buildingId);
    return { success: true, data: result };
  }

  @Get('revenue-by-month')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(...FINANCE_ROLES)
  @ApiOperation({ summary: 'Get revenue by month for charts (last 6 months)' })
  @ApiResponse({ status: 200, description: 'Return revenue by month' })
  async getRevenueByMonth(@BuildingId() buildingId: string) {
    const result = await this.dashboardService.getRevenueByMonth(buildingId, 6);
    return { success: true, data: result };
  }

  private async canSeeFinances(
    user: { id: string; role: string },
    buildingId: string,
  ): Promise<boolean> {
    // Owners reach this point only for their own buildings (BuildingAccessGuard)
    if (user.role === 'owner') return true;
    const assignment = await this.prisma.managerBuildingRole.findFirst({
      where: { managerId: user.id, buildingId, deletedAt: null },
      select: { roles: true },
    });
    return !!assignment?.roles.some((r) => FINANCE_ROLES.includes(r));
  }
}
