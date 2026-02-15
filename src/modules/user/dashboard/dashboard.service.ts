import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats(buildingId: string) {
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const [
      totalTenants,
      totalUnits,
      occupiedUnits,
      revenueThisMonth,
      pendingRequests,
    ] = await Promise.all([
      this.prisma.tenant.count({ where: { buildingId, status: 'active' } }),
      this.prisma.unit.count({
        where: { buildingId, status: { not: 'inactive' } },
      }),
      this.prisma.unit.count({ where: { buildingId, status: 'occupied' } }),
      this.prisma.payment.aggregate({
        where: {
          buildingId,
          status: 'completed',
          paymentDate: { gte: firstDayOfMonth, lte: lastDayOfMonth },
        },
        _sum: { amount: true },
      }),
      this.prisma.maintenanceRequest.count({
        where: { buildingId, status: { in: ['pending', 'in_progress'] } },
      }),
    ]);

    const occupancyRate =
      totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

    return {
      totalTenants,
      totalUnits,
      occupiedUnits,
      occupancyRate: Math.round(occupancyRate * 100) / 100,
      revenueThisMonth: Number(revenueThisMonth._sum.amount || 0),
      pendingMaintenanceRequests: pendingRequests,
    };
  }

  async getUpcomingPayments(buildingId: string) {
    const today = new Date();
    const twoWeeksLater = new Date(today);
    twoWeeksLater.setDate(today.getDate() + 14);

    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const nextMonth = `${twoWeeksLater.getFullYear()}-${String(twoWeeksLater.getMonth() + 1).padStart(2, '0')}`;

    const upcomingPeriods = await this.prisma.paymentPeriod.findMany({
      where: {
        lease: { buildingId },
        status: { in: ['unpaid', 'overdue'] },
        month: { in: [currentMonth, nextMonth] },
      },
      include: {
        lease: {
          select: {
            tenant: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            unit: {
              select: {
                id: true,
                unitNumber: true,
              },
            },
          },
        },
      },
      orderBy: { month: 'asc' },
    });

    return upcomingPeriods.map((period) => ({
      tenantId: period.lease.tenant.id,
      tenantName: period.lease.tenant.name,
      tenantEmail: period.lease.tenant.email,
      unit: period.lease.unit,
      month: period.month,
      amount: Number(period.rentAmount),
      status: period.status,
    }));
  }
}
