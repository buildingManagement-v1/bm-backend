import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

export interface ReportSummary {
  occupancyRate: number;
  totalUnits: number;
  occupiedUnits: number;
  vacantCount: number;
  expectedRentThisMonth: number;
  collectedRentThisMonth: number;
  collectionRateThisMonth: number;
  outstandingAmount: number;
  outstandingCount: number;
  expiringIn30Days: number;
  openMaintenanceCount: number;
  period: { year: number; month: number };
  summaryText?: string;
  highlights?: string[];
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getSummary(buildingId: string): Promise<ReportSummary> {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentMonthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    const startOfMonth = new Date(currentYear, currentMonth - 1, 1);
    const endOfMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

    const [
      totalUnits,
      occupiedUnits,
      vacantCount,
      expectedRentThisMonth,
      collectedThisMonth,
      outstandingData,
      expiringIn30Days,
      openMaintenanceCount,
    ] = await Promise.all([
      this.prisma.unit.count({
        where: { buildingId, status: { not: 'inactive' } },
      }),
      this.prisma.unit.count({ where: { buildingId, status: 'occupied' } }),
      this.prisma.unit.count({ where: { buildingId, status: 'vacant' } }),
      this.prisma.paymentPeriod
        .aggregate({
          where: {
            lease: { buildingId, status: 'active' },
            month: currentMonthStr,
          },
          _sum: { rentAmount: true },
        })
        .then((r) => Number(r._sum.rentAmount ?? 0)),
      this.prisma.payment
        .aggregate({
          where: {
            buildingId,
            status: 'completed',
            paymentDate: { gte: startOfMonth, lte: endOfMonth },
          },
          _sum: { amount: true },
        })
        .then((r) => Number(r._sum.amount ?? 0)),
      this.prisma.paymentPeriod
        .aggregate({
          where: {
            lease: { buildingId },
            status: { in: ['unpaid', 'overdue'] },
          },
          _sum: { rentAmount: true },
          _count: true,
        })
        .then((r) => ({
          amount: Number(r._sum.rentAmount ?? 0),
          count: r._count,
        })),
      this.prisma.lease.count({
        where: {
          buildingId,
          status: 'active',
          endDate: {
            gte: now,
            lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      this.prisma.maintenanceRequest.count({
        where: {
          buildingId,
          status: { in: ['pending', 'in_progress'] },
        },
      }),
    ]);

    const occupancyRate =
      totalUnits > 0
        ? Math.round((occupiedUnits / totalUnits) * 10000) / 100
        : 0;
    const collectionRateThisMonth =
      expectedRentThisMonth > 0
        ? Math.round((collectedThisMonth / expectedRentThisMonth) * 10000) / 100
        : 0;

    const highlights: string[] = [];
    if (outstandingData.amount > 0)
      highlights.push(
        `ETB ${outstandingData.amount.toLocaleString()} outstanding (${outstandingData.count} period(s))`,
      );
    if (vacantCount > 0) highlights.push(`${vacantCount} vacant unit(s)`);
    if (expiringIn30Days > 0)
      highlights.push(`${expiringIn30Days} lease(s) expiring in 30 days`);
    if (openMaintenanceCount > 0)
      highlights.push(`${openMaintenanceCount} open maintenance request(s)`);
    const summaryText =
      highlights.length > 0
        ? `This month: ${highlights.join('; ')}.`
        : 'No major issues this month.';

    return {
      occupancyRate,
      totalUnits,
      occupiedUnits,
      vacantCount,
      expectedRentThisMonth,
      collectedRentThisMonth: collectedThisMonth,
      collectionRateThisMonth,
      outstandingAmount: outstandingData.amount,
      outstandingCount: outstandingData.count,
      expiringIn30Days,
      openMaintenanceCount,
      period: { year: currentYear, month: currentMonth },
      summaryText,
      highlights,
    };
  }

  async getMaintenance(buildingId: string) {
    const [openCount, byPriority] = await Promise.all([
      this.prisma.maintenanceRequest.count({
        where: {
          buildingId,
          status: { in: ['pending', 'in_progress'] },
        },
      }),
      this.prisma.maintenanceRequest.groupBy({
        by: ['priority'],
        where: {
          buildingId,
          status: { in: ['pending', 'in_progress'] },
        },
        _count: true,
      }),
    ]);
    const byPriorityMap: Record<string, number> = {};
    for (const g of byPriority) {
      byPriorityMap[g.priority] = g._count;
    }
    return {
      openCount,
      byPriority: byPriorityMap,
    };
  }

  async getPortfolio(userId: string, userRole: string) {
    const buildings = await this.getBuildingIdsForUser(userId, userRole);
    const result = await Promise.all(
      buildings.map(async (b) => {
        const summary = await this.getSummary(b.id);
        return {
          id: b.id,
          name: b.name,
          occupancyRate: summary.occupancyRate,
          collectedThisMonth: summary.collectedRentThisMonth,
          expectedThisMonth: summary.expectedRentThisMonth,
          outstandingAmount: summary.outstandingAmount,
          vacantCount: summary.vacantCount,
          expiringIn30: summary.expiringIn30Days,
          openMaintenance: summary.openMaintenanceCount,
        };
      }),
    );
    return { buildings: result };
  }

  private async getBuildingIdsForUser(
    userId: string,
    userRole: string,
  ): Promise<{ id: string; name: string }[]> {
    if (userRole === 'manager') {
      const assignments = await this.prisma.managerBuildingRole.findMany({
        where: { managerId: userId },
        include: { building: { select: { id: true, name: true } } },
      });
      return assignments.map((a) => a.building);
    }
    const list = await this.prisma.building.findMany({
      where: { userId, status: 'active' },
      select: { id: true, name: true },
    });
    return list;
  }

  async getOccupancy(buildingId: string, historyMonths = 6) {
    const [totalUnits, occupiedUnits, vacantUnits, allUnits] =
      await Promise.all([
        this.prisma.unit.count({
          where: { buildingId, status: { not: 'inactive' } },
        }),
        this.prisma.unit.count({ where: { buildingId, status: 'occupied' } }),
        this.prisma.unit.findMany({
          where: { buildingId, status: 'vacant' },
          select: {
            id: true,
            unitNumber: true,
            floor: true,
            type: true,
            rentPrice: true,
          },
        }),
        this.prisma.unit.findMany({
          where: { buildingId, status: { not: 'inactive' } },
          select: { id: true },
        }),
      ]);

    const vacancyCount = totalUnits - occupiedUnits;
    const occupancyRate =
      totalUnits > 0
        ? Math.round((occupiedUnits / totalUnits) * 10000) / 100
        : 0;
    const lostRentPerMonth = vacantUnits.reduce(
      (sum, u) => sum + Number(u.rentPrice),
      0,
    );

    const occupancyByMonth: Array<{
      month: string;
      occupancyRate: number;
      occupied: number;
      total: number;
    }> = [];
    if (historyMonths > 0 && allUnits.length > 0) {
      const leases = await this.prisma.lease.findMany({
        where: { buildingId, status: 'active' },
        select: { startDate: true, endDate: true },
      });
      const total = allUnits.length;
      const now = new Date();
      for (let i = historyMonths - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const monthEnd = new Date(
          d.getFullYear(),
          d.getMonth() + 1,
          0,
          23,
          59,
          59,
          999,
        ).getTime();
        const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
        const occupiedInMonth = leases.filter(
          (l) =>
            new Date(l.startDate).getTime() <= monthEnd &&
            new Date(l.endDate).getTime() >= monthStart,
        ).length;
        const rate =
          total > 0 ? Math.round((occupiedInMonth / total) * 10000) / 100 : 0;
        occupancyByMonth.push({
          month: monthStr,
          occupancyRate: rate,
          occupied: occupiedInMonth,
          total,
        });
      }
    }

    return {
      totalUnits,
      occupiedUnits,
      vacantUnits: vacancyCount,
      occupancyRate,
      lostRentPerMonth,
      vacantUnitsList: vacantUnits,
      occupancyByMonth,
    };
  }

  async getRevenue(buildingId: string, startDate?: string, endDate?: string) {
    const start = startDate
      ? new Date(startDate)
      : new Date(new Date().getFullYear(), 0, 1);
    const end = endDate ? new Date(endDate) : new Date();

    // Months in range (YYYY-MM)
    const monthsInRange: string[] = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cursor <= end) {
      monthsInRange.push(
        `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
      );
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const [periodsInRange, paymentsInRange, outstandingPaymentsData] =
      await Promise.all([
        this.prisma.paymentPeriod.findMany({
          where: {
            lease: { buildingId, status: 'active' },
            month: { in: monthsInRange },
          },
          select: { month: true, rentAmount: true },
        }),
        this.prisma.payment.findMany({
          where: {
            buildingId,
            status: 'completed',
            paymentDate: { gte: start, lte: end },
          },
          select: { amount: true, paymentDate: true },
        }),
        this.prisma.paymentPeriod.findMany({
          where: {
            lease: { buildingId },
            status: { in: ['unpaid', 'overdue'] },
          },
          include: {
            lease: {
              select: {
                tenant: { select: { id: true, name: true } },
                unit: { select: { id: true, unitNumber: true } },
              },
            },
          },
        }),
      ]);

    const expectedRent = periodsInRange.reduce(
      (sum, p) => sum + Number(p.rentAmount),
      0,
    );
    const collectedRent = paymentsInRange.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );
    const collectionRate =
      expectedRent > 0
        ? Math.round((collectedRent / expectedRent) * 10000) / 100
        : 0;

    const expectedByMonth = new Map<string, number>();
    for (const m of monthsInRange) expectedByMonth.set(m, 0);
    for (const p of periodsInRange) {
      expectedByMonth.set(
        p.month,
        (expectedByMonth.get(p.month) ?? 0) + Number(p.rentAmount),
      );
    }
    const collectedByMonth = new Map<string, number>();
    for (const m of monthsInRange) collectedByMonth.set(m, 0);
    for (const p of paymentsInRange) {
      const d = new Date(p.paymentDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (collectedByMonth.has(key))
        collectedByMonth.set(
          key,
          (collectedByMonth.get(key) ?? 0) + Number(p.amount),
        );
    }

    const revenueByMonth = monthsInRange.map((month) => ({
      month,
      expected: expectedByMonth.get(month) ?? 0,
      collected: collectedByMonth.get(month) ?? 0,
    }));

    const now = new Date();
    const outstandingAmount = outstandingPaymentsData.reduce(
      (sum, p) => sum + Number(p.rentAmount),
      0,
    );
    const aging = { days0_30: 0, days31_60: 0, days61Plus: 0 };
    const periodsWithOverdue: Array<{
      month: string;
      amount: number;
      status: string;
      daysOverdue: number;
      tenant: { id: string; name: string };
      unit: { id: string; unitNumber: string };
    }> = [];

    const leaseKey = (p: (typeof outstandingPaymentsData)[0]) => p.leaseId;
    const groupedByLease = new Map<
      string,
      {
        tenant: { id: string; name: string };
        unit: { id: string; unitNumber: string };
        totalAmount: number;
        periodCount: number;
        months: string[];
        maxDaysOverdue: number;
      }
    >();

    for (const p of outstandingPaymentsData) {
      const [y, m] = p.month.split('-').map(Number);
      const periodEnd = new Date(y, m, 0, 23, 59, 59, 999);
      const daysOverdue = Math.max(
        0,
        Math.ceil(
          (now.getTime() - periodEnd.getTime()) / (1000 * 60 * 60 * 24),
        ),
      );
      const amount = Number(p.rentAmount);
      if (daysOverdue <= 30) aging.days0_30 += amount;
      else if (daysOverdue <= 60) aging.days31_60 += amount;
      else aging.days61Plus += amount;
      periodsWithOverdue.push({
        month: p.month,
        amount,
        status: p.status,
        daysOverdue,
        tenant: p.lease.tenant,
        unit: p.lease.unit,
      });

      const key = leaseKey(p);
      const existing = groupedByLease.get(key);
      if (!existing) {
        groupedByLease.set(key, {
          tenant: p.lease.tenant,
          unit: p.lease.unit,
          totalAmount: amount,
          periodCount: 1,
          months: [p.month],
          maxDaysOverdue: daysOverdue,
        });
      } else {
        existing.totalAmount += amount;
        existing.periodCount += 1;
        existing.months.push(p.month);
        existing.maxDaysOverdue = Math.max(
          existing.maxDaysOverdue,
          daysOverdue,
        );
      }
    }

    const groupedList = Array.from(groupedByLease.values()).sort(
      (a, b) => b.maxDaysOverdue - a.maxDaysOverdue,
    );

    return {
      expectedRent,
      collectedRent,
      collectionRate,
      totalRevenue: collectedRent,
      dateRange: { startDate: start, endDate: end },
      revenueByMonth,
      outstanding: {
        count: outstandingPaymentsData.length,
        amount: outstandingAmount,
        aging,
        periods: periodsWithOverdue,
        groupedByLease: groupedList,
      },
    };
  }

  async getTenants(buildingId: string) {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const in30 = new Date(now + 30 * day);
    const in60 = new Date(now + 60 * day);
    const in90 = new Date(now + 90 * day);

    const [
      activeTenants,
      inactiveTenants,
      expiringIn90Days,
      tenantPaymentHistory,
    ] = await Promise.all([
      this.prisma.tenant.count({ where: { buildingId, status: 'active' } }),
      this.prisma.tenant.count({ where: { buildingId, status: 'inactive' } }),
      this.prisma.lease.findMany({
        where: {
          buildingId,
          status: 'active',
          endDate: { gte: new Date(), lte: in90 },
        },
        include: {
          tenant: { select: { id: true, name: true, email: true } },
          unit: { select: { id: true, unitNumber: true } },
        },
        orderBy: { endDate: 'asc' },
      }),
      this.prisma.tenant.findMany({
        where: { buildingId, status: 'active' },
        select: {
          id: true,
          name: true,
          email: true,
          payments: {
            where: { status: 'completed' },
            select: { amount: true, paymentDate: true },
          },
        },
      }),
    ]);

    const toItem = (lease: (typeof expiringIn90Days)[0]) => {
      const days = Math.ceil((lease.endDate.getTime() - now) / day);
      return {
        leaseId: lease.id,
        tenant: lease.tenant,
        unit: lease.unit,
        endDate: lease.endDate,
        daysUntilExpiration: days,
      };
    };

    const expiringIn30 = expiringIn90Days
      .filter((l) => l.endDate <= in30)
      .map(toItem);
    const expiringIn60 = expiringIn90Days
      .filter((l) => l.endDate > in30 && l.endDate <= in60)
      .map(toItem);
    const expiringIn90 = expiringIn90Days
      .filter((l) => l.endDate > in60)
      .map(toItem);

    const paymentHistory = tenantPaymentHistory.map((tenant) => ({
      tenantId: tenant.id,
      tenantName: tenant.name,
      email: tenant.email,
      totalPaid: tenant.payments.reduce((sum, p) => sum + Number(p.amount), 0),
      paymentsCount: tenant.payments.length,
      lastPayment:
        tenant.payments.length > 0
          ? tenant.payments.sort(
              (a, b) =>
                new Date(b.paymentDate).getTime() -
                new Date(a.paymentDate).getTime(),
            )[0].paymentDate
          : null,
    }));

    return {
      totalTenants: activeTenants + inactiveTenants,
      activeTenants,
      inactiveTenants,
      expiringIn30: { count: expiringIn30.length, list: expiringIn30 },
      expiringIn60: { count: expiringIn60.length, list: expiringIn60 },
      expiringIn90: { count: expiringIn90.length, list: expiringIn90 },
      paymentHistory,
    };
  }

  async getExportCsv(
    buildingId: string,
    report: 'outstanding' | 'expirations' | 'vacant',
  ): Promise<string> {
    const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;

    if (report === 'outstanding') {
      const data = await this.getRevenue(buildingId);
      const rows = [
        ['Tenant', 'Unit', 'Month', 'Amount', 'Status', 'Days Overdue'].join(
          ',',
        ),
        ...data.outstanding.periods.map((p) =>
          [
            escape(p.tenant.name),
            p.unit.unitNumber,
            p.month,
            p.amount,
            p.status,
            p.daysOverdue,
          ].join(','),
        ),
      ];
      return rows.join('\n');
    }

    if (report === 'expirations') {
      const data = await this.getTenants(buildingId);
      const list = [
        ...data.expiringIn30.list,
        ...data.expiringIn60.list,
        ...data.expiringIn90.list,
      ];
      const rows = [
        ['Tenant', 'Email', 'Unit', 'End Date', 'Days Left'].join(','),
        ...list.map((p) =>
          [
            escape(p.tenant.name),
            escape(p.tenant.email),
            p.unit.unitNumber,
            new Date(p.endDate).toISOString().slice(0, 10),
            p.daysUntilExpiration,
          ].join(','),
        ),
      ];
      return rows.join('\n');
    }

    if (report === 'vacant') {
      const data = await this.getOccupancy(buildingId, 0);
      const rows = [
        ['Unit', 'Floor', 'Type', 'Rent Price'].join(','),
        ...data.vacantUnitsList.map((u) =>
          [u.unitNumber, u.floor ?? '', u.type ?? '', Number(u.rentPrice)].join(
            ',',
          ),
        ),
      ];
      return rows.join('\n');
    }

    return '';
  }
}
