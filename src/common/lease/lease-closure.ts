import { Prisma } from 'generated/prisma/client';

type Tx = Prisma.TransactionClient;

export interface LeaseClosureResult {
  unitFreed: boolean;
  parkingReleased: number;
  parkingRequestsRejected: number;
  paymentRequestsRejected: number;
  tenantDeactivated: boolean;
}

/**
 * Releases what a lease held once it has ended (terminated or expired):
 * frees the unit unless another active lease holds it, removes its parking
 * registrations, rejects pending requests that can no longer be fulfilled,
 * and marks the tenant inactive once they have no active lease and nothing
 * left to pay (tenants who still owe keep portal access so they can pay).
 */
export async function releaseLeaseResources(
  tx: Tx,
  lease: { id: string; unitId: string; tenantId: string },
  opts: { actorId: string | null; reason: string; at: Date },
): Promise<LeaseClosureResult> {
  const otherActiveOnUnit = await tx.lease.count({
    where: {
      unitId: lease.unitId,
      id: { not: lease.id },
      status: 'active',
      deletedAt: null,
    },
  });
  if (otherActiveOnUnit === 0) {
    await tx.unit.updateMany({
      where: { id: lease.unitId, status: 'occupied' },
      data: { status: 'vacant' },
    });
  }

  const parking = await tx.parkingRegistration.updateMany({
    where: { leaseId: lease.id, deletedAt: null },
    data: { deletedAt: opts.at, deletedById: opts.actorId ?? 'system' },
  });

  const parkingRequests = await tx.tenantParkingRequest.updateMany({
    where: { leaseId: lease.id, status: 'pending' },
    data: {
      status: 'rejected',
      rejectionReason: opts.reason,
      reviewedAt: opts.at,
      reviewedById: opts.actorId,
    },
  });

  const paymentRequestsRejected = await rejectStalePaymentRequests(
    tx,
    lease.id,
    opts,
  );

  let tenantDeactivated = false;
  const [activeLeases, outstanding] = await Promise.all([
    tx.lease.count({
      where: { tenantId: lease.tenantId, status: 'active', deletedAt: null },
    }),
    tx.paymentPeriod.count({
      where: {
        status: { in: ['unpaid', 'overdue'] },
        lease: { tenantId: lease.tenantId, deletedAt: null },
      },
    }),
  ]);
  if (activeLeases === 0 && outstanding === 0) {
    await tx.tenant.update({
      where: { id: lease.tenantId },
      data: { status: 'inactive' },
    });
    tenantDeactivated = true;
  }

  return {
    unitFreed: otherActiveOnUnit === 0,
    parkingReleased: parking.count,
    parkingRequestsRejected: parkingRequests.count,
    paymentRequestsRejected,
    tenantDeactivated,
  };
}

/**
 * Rejects pending rent payment requests on a lease whose periods no longer
 * exist unpaid (removed or re-priced by a lease change or termination), so
 * managers can't approve them and the tenant is told to resubmit.
 */
export async function rejectStalePaymentRequests(
  tx: Tx,
  leaseId: string,
  opts: {
    actorId: string | null;
    reason: string;
    at: Date;
    /** Periods that were regenerated/re-priced, even if their key survived */
    touchedMonths?: Set<string>;
  },
): Promise<number> {
  const pending = await tx.tenantPaymentRequest.findMany({
    where: { leaseId, status: 'pending', type: 'rent' },
    select: { id: true, monthsCovered: true },
  });
  if (pending.length === 0) return 0;

  const open = await tx.paymentPeriod.findMany({
    where: { leaseId, status: { in: ['unpaid', 'overdue'] } },
    select: { month: true },
  });
  const openMonths = new Set(open.map((p) => p.month));

  const stale = pending.filter((r) => {
    const months = Array.isArray(r.monthsCovered)
      ? (r.monthsCovered as unknown[]).filter(
          (m): m is string => typeof m === 'string',
        )
      : [];
    return (
      months.length === 0 ||
      months.some((m) => !openMonths.has(m) || opts.touchedMonths?.has(m))
    );
  });
  if (stale.length === 0) return 0;

  await tx.tenantPaymentRequest.updateMany({
    where: { id: { in: stale.map((r) => r.id) } },
    data: {
      status: 'rejected',
      rejectionReason: opts.reason,
      reviewedAt: opts.at,
      reviewedById: opts.actorId,
    },
  });
  return stale.length;
}
