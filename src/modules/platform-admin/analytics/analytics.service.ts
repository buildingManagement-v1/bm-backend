import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { roundMoney, todayDate } from 'src/common/lease/lease-cycles.util';
import { isFreePlan } from 'src/common/plan-limits/free-plan.util';

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/** Platform-wide KPIs for the admin dashboard. */
@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async overview() {
    const now = new Date();
    const today = todayDate(now);
    const monthStart = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
    );
    const yearAgo = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1),
    );

    const [
      owners,
      buildings,
      units,
      activeTenants,
      activeManagers,
      activeSubscriptions,
      ownersWithActive,
      approvedRequests,
      pendingRequests,
      signups,
      rentThisMonth,
    ] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['status'],
        where: { deletedAt: null },
        _count: true,
      }),
      this.prisma.building.count({ where: { deletedAt: null } }),
      this.prisma.unit.groupBy({
        by: ['status'],
        where: { deletedAt: null, building: { deletedAt: null } },
        _count: true,
      }),
      this.prisma.tenant.count({
        where: { deletedAt: null, status: 'active' },
      }),
      this.prisma.manager.count({
        where: { deletedAt: null, status: 'active' },
      }),
      this.prisma.subscription.findMany({
        where: { status: 'active', billingCycleEnd: { gte: now } },
        select: {
          userId: true,
          totalAmount: true,
          plan: { select: { id: true, name: true, price: true } },
        },
      }),
      this.prisma.subscription
        .findMany({
          where: { status: 'active', billingCycleEnd: { gte: now } },
          select: { userId: true },
          distinct: ['userId'],
        })
        .then((rows) => new Set(rows.map((r) => r.userId))),
      this.prisma.subscriptionRequest.findMany({
        where: { status: 'approved', reviewedAt: { gte: yearAgo } },
        select: { amount: true, reviewedAt: true },
      }),
      this.prisma.subscriptionRequest.count({ where: { status: 'pending' } }),
      this.prisma.user.findMany({
        where: { createdAt: { gte: yearAgo } },
        select: { createdAt: true },
      }),
      this.prisma.payment.aggregate({
        where: {
          type: 'rent',
          status: 'completed',
          paymentDate: { gte: monthStart },
          building: { deletedAt: null },
        },
        _sum: { amount: true },
      }),
    ]);

    const ownerTotals = { total: 0, active: 0, inactive: 0 };
    for (const g of owners) {
      ownerTotals.total += g._count;
      ownerTotals[g.status] += g._count;
    }
    const pendingDeletion = await this.prisma.user.count({
      where: { deletedAt: { not: null } },
    });

    const unitCounts = { total: 0, occupied: 0, vacant: 0, inactive: 0 };
    for (const g of units) {
      unitCounts[g.status] += g._count;
      if (g.status !== 'inactive') unitCounts.total += g._count;
    }

    // Plan mix and recurring revenue (paid plans are billed yearly)
    const planMix = new Map<string, { plan: string; owners: number }>();
    let arr = 0;
    let trials = 0;
    for (const s of activeSubscriptions) {
      const entry = planMix.get(s.plan.id) ?? { plan: s.plan.name, owners: 0 };
      entry.owners++;
      planMix.set(s.plan.id, entry);
      if (isFreePlan(s.plan)) trials++;
      else arr += Number(s.totalAmount);
    }

    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      months.push(
        monthKey(
          new Date(
            Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1),
          ),
        ),
      );
    }
    const signupsByMonth = new Map(months.map((m) => [m, 0]));
    for (const u of signups) {
      const k = monthKey(u.createdAt);
      if (signupsByMonth.has(k))
        signupsByMonth.set(k, signupsByMonth.get(k)! + 1);
    }
    const billingByMonth = new Map(months.map((m) => [m, 0]));
    for (const r of approvedRequests) {
      const k = monthKey(r.reviewedAt!);
      if (billingByMonth.has(k)) {
        billingByMonth.set(
          k,
          roundMoney(billingByMonth.get(k)! + Number(r.amount)),
        );
      }
    }

    return {
      owners: {
        ...ownerTotals,
        pendingDeletion,
        withActivePlan: ownersWithActive.size,
        withoutActivePlan: Math.max(
          0,
          ownerTotals.total - ownersWithActive.size,
        ),
        newThisMonth: signups.filter((u) => u.createdAt >= monthStart).length,
      },
      portfolio: {
        buildings,
        units: unitCounts.total,
        occupiedUnits: unitCounts.occupied,
        vacantUnits: unitCounts.vacant,
        occupancyRate: unitCounts.total
          ? Math.round((unitCounts.occupied / unitCounts.total) * 1000) / 10
          : 0,
        activeTenants,
        activeManagers,
        rentCollectedThisMonth: Number(rentThisMonth._sum.amount ?? 0),
      },
      subscriptions: {
        active: activeSubscriptions.length,
        trials,
        paid: activeSubscriptions.length - trials,
        planMix: [...planMix.values()].sort((a, b) => b.owners - a.owners),
        arr: roundMoney(arr),
        mrr: roundMoney(arr / 12),
        pendingRequests,
        billedThisMonth: billingByMonth.get(monthKey(monthStart)) ?? 0,
      },
      trends: months.map((m) => ({
        month: m,
        signups: signupsByMonth.get(m) ?? 0,
        billed: billingByMonth.get(m) ?? 0,
      })),
    };
  }
}
