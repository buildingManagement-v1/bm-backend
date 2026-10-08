import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  addDays,
  roundMoney,
  todayDate,
} from 'src/common/lease/lease-cycles.util';
import { computeRentTaxBreakdown } from 'src/common/tax/rent-period.util';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats(buildingId: string, includeRevenue: boolean) {
    const today = todayDate();
    const firstDayOfMonth = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
    );
    const lastDayOfMonth = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth() + 1,
        0,
        23,
        59,
        59,
        999,
      ),
    );

    const [
      totalTenants,
      totalUnits,
      occupiedUnits,
      revenueThisMonth,
      pendingRequests,
    ] = await Promise.all([
      this.prisma.tenant.count({
        where: { buildingId, status: 'active', deletedAt: null },
      }),
      this.prisma.unit.count({
        where: { buildingId, status: { not: 'inactive' }, deletedAt: null },
      }),
      this.prisma.unit.count({
        where: { buildingId, status: 'occupied', deletedAt: null },
      }),
      this.prisma.payment.aggregate({
        where: {
          buildingId,
          status: 'completed',
          paymentDate: { gte: firstDayOfMonth, lte: lastDayOfMonth },
        },
        _sum: { amount: true },
      }),
      this.prisma.maintenanceRequest.count({
        where: {
          buildingId,
          status: { in: ['pending', 'in_progress'] },
          deletedAt: null,
        },
      }),
    ]);

    const occupancyRate =
      totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

    return {
      totalTenants,
      totalUnits,
      occupiedUnits,
      occupancyRate: Math.round(occupancyRate * 100) / 100,
      revenueThisMonth: includeRevenue
        ? Number(revenueThisMonth._sum.amount || 0)
        : null,
      pendingMaintenanceRequests: pendingRequests,
    };
  }

  /**
   * Rent to chase: everything overdue plus unpaid cycles due in the next two
   * weeks, grouped per tenant and unit, with amounts including tax.
   */
  async getUpcomingPayments(buildingId: string) {
    const today = todayDate();
    const [upcomingPeriods, building] = await Promise.all([
      this.prisma.paymentPeriod.findMany({
        where: {
          lease: { buildingId, deletedAt: null, tenant: { deletedAt: null } },
          OR: [
            { status: 'overdue' },
            { status: 'unpaid', periodStart: { lte: addDays(today, 14) } },
          ],
        },
        include: {
          lease: {
            select: {
              applyWithholding: true,
              tenant: { select: { id: true, name: true, email: true } },
              unit: { select: { id: true, unitNumber: true } },
            },
          },
        },
        orderBy: { periodStart: 'asc' },
      }),
      this.prisma.building.findUnique({
        where: { id: buildingId },
        select: { vatRate: true, withholdingRate: true },
      }),
    ]);

    // Group by tenant + unit (one row per tenant-unit, multiple months)
    const grouped = new Map<
      string,
      {
        tenantId: string;
        tenantName: string;
        tenantEmail: string;
        unit: { id: string; unitNumber: string };
        months: string[];
        totalAmount: number;
        overdue: boolean;
      }
    >();
    for (const period of upcomingPeriods) {
      const key = `${period.lease.tenant.id}:${period.lease.unit.id}`;
      const amount = computeRentTaxBreakdown(
        Number(period.rentAmount),
        Number(building?.vatRate ?? 0),
        Number(building?.withholdingRate ?? 0),
        period.lease.applyWithholding,
      ).totalAmount;
      const existing = grouped.get(key);
      if (!existing) {
        grouped.set(key, {
          tenantId: period.lease.tenant.id,
          tenantName: period.lease.tenant.name,
          tenantEmail: period.lease.tenant.email,
          unit: period.lease.unit,
          months: [period.month],
          totalAmount: amount,
          overdue: period.status === 'overdue',
        });
      } else {
        existing.months.push(period.month);
        existing.totalAmount = roundMoney(existing.totalAmount + amount);
        existing.overdue ||= period.status === 'overdue';
      }
    }
    return Array.from(grouped.values()).sort((a, b) =>
      a.months[0].localeCompare(b.months[0]),
    );
  }

  /**
   * Revenue by month for the last 6 months (for bar chart).
   */
  async getRevenueByMonth(buildingId: string, months = 6) {
    const today = todayDate();
    const result: { month: string; label: string; revenue: number }[] = [];

    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1),
      );
      const firstDay = d;
      const lastDay = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999),
      );

      const agg = await this.prisma.payment.aggregate({
        where: {
          buildingId,
          status: 'completed',
          paymentDate: { gte: firstDay, lte: lastDay },
        },
        _sum: { amount: true },
      });

      const monthStr = d.toISOString().slice(0, 7);
      const label = d.toLocaleDateString('en-US', {
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC',
      });
      result.push({
        month: monthStr,
        label,
        revenue: Number(agg._sum.amount || 0),
      });
    }

    return result;
  }
}
