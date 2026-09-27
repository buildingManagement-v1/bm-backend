import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from 'generated/prisma/client';
import { CreateLeaseDto, TerminateLeaseDto, UpdateLeaseDto } from './dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { EmailService } from 'src/common/email/email.service';
import { NotificationsService } from 'src/common/notifications/notifications.service';
import { SoftDeleteService } from 'src/common/soft-delete/soft-delete.service';
import { whereActive } from 'src/common/soft-delete/soft-delete.scope';
import {
  addDays,
  daysBetweenInclusive,
  generateCycles,
  isoDate,
  proratedRent,
  toUtcDate,
  todayDate,
} from 'src/common/lease/lease-cycles.util';
import {
  rejectStalePaymentRequests,
  releaseLeaseResources,
} from 'src/common/lease/lease-closure';

const leaseInclude = {
  tenant: { select: { id: true, name: true, email: true } },
  unit: { select: { id: true, unitNumber: true, floor: true } },
} satisfies Prisma.LeaseInclude;

type Tx = Prisma.TransactionClient;

@Injectable()
export class LeasesService {
  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
    private emailService: EmailService,
    private notificationsService: NotificationsService,
    private softDeleteService: SoftDeleteService,
  ) {}

  async create(
    buildingId: string,
    dto: CreateLeaseDto,
    userId: string,
    userRole: string,
  ) {
    const start = toUtcDate(dto.startDate);
    const end = toUtcDate(dto.endDate);
    const today = todayDate();

    if (end <= start) {
      throw new BadRequestException(
        'Lease end date must be after its start date',
      );
    }
    if (end < today) {
      throw new BadRequestException('Lease end date is in the past');
    }
    if (!dto.useDefaultPaymentDay && !dto.paymentCollectionDay) {
      throw new BadRequestException(
        'Choose a payment collection day or use the building default',
      );
    }

    const [tenant, unit, building] = await Promise.all([
      this.prisma.tenant.findFirst({
        where: whereActive({ id: dto.tenantId, buildingId }),
      }),
      this.prisma.unit.findFirst({
        where: whereActive({ id: dto.unitId, buildingId }),
      }),
      this.prisma.building.findFirst({
        where: { id: buildingId },
        select: { paymentCollectionDay: true, totalParkingLots: true },
      }),
    ]);

    if (!tenant) {
      throw new NotFoundException('Tenant not found in this building');
    }

    if (!unit) {
      throw new NotFoundException('Unit not found in this building');
    }

    if (unit.status === 'inactive') {
      throw new BadRequestException(
        'This unit is marked inactive and cannot be leased',
      );
    }

    const effectivePaymentDay = dto.useDefaultPaymentDay
      ? (building?.paymentCollectionDay ?? 1)
      : dto.paymentCollectionDay!;

    await this.assertParkingCapacity(
      buildingId,
      building?.totalParkingLots ?? 0,
      dto.carsAllowed ?? 0,
    );
    await this.assertNoOverlap(dto.unitId, start, end);

    const lease = await this.prisma.$transaction(async (tx) => {
      const newLease = await tx.lease.create({
        data: {
          buildingId,
          tenantId: dto.tenantId,
          unitId: dto.unitId,
          startDate: start,
          endDate: end,
          rentAmount: dto.rentAmount,
          securityDeposit: dto.securityDeposit ?? undefined,
          carsAllowed: dto.carsAllowed ?? 0,
          useDefaultPaymentDay: dto.useDefaultPaymentDay,
          paymentCollectionDay: effectivePaymentDay,
          applyWithholding: dto.applyWithholding,
          status: 'active',
          terms: dto.terms as Prisma.InputJsonValue,
        },
        include: leaseInclude,
      });

      // Unit is taken (or reserved, for a future start) and its asking rent
      // follows the latest lease
      await tx.unit.update({
        where: { id: dto.unitId },
        data: { status: 'occupied', rentPrice: dto.rentAmount },
      });

      await tx.tenant.update({
        where: { id: dto.tenantId },
        data: { status: 'active' },
      });

      const cycles = generateCycles(
        start,
        end,
        effectivePaymentDay,
        dto.rentAmount,
      );
      await tx.paymentPeriod.createMany({
        data: cycles.map((c) => ({
          leaseId: newLease.id,
          month: c.month,
          periodStart: c.periodStart,
          periodEnd: c.periodEnd,
          daysInCycle: c.daysInCycle,
          rentAmount: c.rentAmount,
          status: 'unpaid' as const,
        })),
      });

      return newLease;
    });

    const userName = await this.getUserName(userId, userRole);
    await this.activityLogsService.create({
      action: 'create',
      entityType: 'lease',
      entityId: lease.id,
      userId,
      userName,
      userRole,
      buildingId,
      details: {
        tenantId: lease.tenantId,
        unitId: lease.unitId,
        startDate: lease.startDate,
        endDate: lease.endDate,
      } as Prisma.InputJsonValue,
    });

    await this.emailService.sendLeaseCreatedEmail(
      lease.tenant.email,
      lease.tenant.name,
      lease.unit.unitNumber,
      lease.startDate,
      lease.endDate,
      Number(lease.rentAmount),
    );

    return lease;
  }

  async findAll(buildingId: string) {
    return await this.prisma.lease.findMany({
      where: whereActive({ buildingId }),
      include: leaseInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, buildingId: string) {
    const lease = await this.prisma.lease.findFirst({
      where: whereActive({ id, buildingId }),
      include: leaseInclude,
    });

    if (!lease) {
      throw new NotFoundException('Lease not found');
    }

    return lease;
  }

  /**
   * Edits an active lease. Cycles that have already started, or that are
   * paid, are history and keep their terms; everything after the last such
   * cycle is regenerated with the new rent / dates / payment day. Pending
   * payment requests for re-priced cycles are rejected so the tenant
   * resubmits against the new amounts.
   */
  async update(
    id: string,
    buildingId: string,
    dto: UpdateLeaseDto,
    userId: string,
    userRole: string,
  ) {
    const lease = await this.prisma.lease.findFirst({
      where: whereActive({ id, buildingId }),
    });

    if (!lease) {
      throw new NotFoundException('Lease not found');
    }

    if (lease.status !== 'active') {
      throw new ConflictException(`Cannot edit a ${lease.status} lease`);
    }

    const building = await this.prisma.building.findFirst({
      where: { id: buildingId },
      select: { paymentCollectionDay: true, totalParkingLots: true },
    });

    const start = dto.startDate ? toUtcDate(dto.startDate) : lease.startDate;
    const end = dto.endDate ? toUtcDate(dto.endDate) : lease.endDate;
    const rent = dto.rentAmount ?? Number(lease.rentAmount);
    const useDefault = dto.useDefaultPaymentDay ?? lease.useDefaultPaymentDay;
    const paymentDay = useDefault
      ? (building?.paymentCollectionDay ?? 1)
      : (dto.paymentCollectionDay ?? lease.paymentCollectionDay ?? 1);

    if (end <= start) {
      throw new BadRequestException(
        'Lease end date must be after its start date',
      );
    }

    const today = todayDate();
    const periods = await this.prisma.paymentPeriod.findMany({
      where: { leaseId: id },
      orderBy: { periodStart: 'asc' },
    });
    // History = cycles already started or already paid
    const frozen = periods.filter(
      (p) => p.status === 'paid' || (p.periodStart && p.periodStart <= today),
    );
    const lastFrozenEnd = frozen.reduce<Date | null>(
      (max, p) =>
        p.periodEnd && (!max || p.periodEnd > max) ? p.periodEnd : max,
      null,
    );

    const startChanged = start.getTime() !== lease.startDate.getTime();
    if (startChanged && frozen.length > 0) {
      throw new BadRequestException(
        'The start date cannot change once a rent cycle has started or been paid',
      );
    }
    if (dto.endDate && end < today) {
      throw new BadRequestException(
        'End date cannot be in the past. Use "Terminate lease" to end it early.',
      );
    }
    if (lastFrozenEnd && end < lastFrozenEnd) {
      throw new BadRequestException(
        `End date cannot be before ${isoDate(lastFrozenEnd)}, the end of the last started or paid rent cycle`,
      );
    }

    if (dto.carsAllowed !== undefined) {
      await this.assertParkingCapacity(
        buildingId,
        building?.totalParkingLots ?? 0,
        dto.carsAllowed,
        id,
      );
      const registered = await this.prisma.parkingRegistration.count({
        where: { leaseId: id, deletedAt: null },
      });
      if (dto.carsAllowed < registered) {
        throw new BadRequestException(
          `This lease has ${registered} registered vehicle(s). Remove some before lowering the limit.`,
        );
      }
    }

    if (startChanged || end.getTime() !== lease.endDate.getTime()) {
      await this.assertNoOverlap(lease.unitId, start, end, id);
    }

    const termsChanged =
      startChanged ||
      end.getTime() !== lease.endDate.getTime() ||
      rent !== Number(lease.rentAmount) ||
      paymentDay !== (lease.paymentCollectionDay ?? 1);

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.lease.update({
        where: { id },
        data: {
          startDate: start,
          endDate: end,
          rentAmount: rent,
          securityDeposit: dto.securityDeposit,
          carsAllowed: dto.carsAllowed,
          useDefaultPaymentDay: useDefault,
          paymentCollectionDay: paymentDay,
          applyWithholding: dto.applyWithholding,
          terms: dto.terms as Prisma.InputJsonValue,
          // A changed end date needs a fresh expiry notice
          ...(end.getTime() !== lease.endDate.getTime() && {
            expiryNoticeSentAt: null,
          }),
        },
        include: leaseInclude,
      });

      if (dto.rentAmount !== undefined) {
        await tx.unit.update({
          where: { id: lease.unitId },
          data: { rentPrice: dto.rentAmount },
        });
      }

      if (termsChanged) {
        const touched = await this.regenerateFuturePeriods(tx, {
          leaseId: id,
          regenFrom: lastFrozenEnd ? addDays(lastFrozenEnd, 1) : start,
          end,
          paymentDay,
          rent,
          frozenIds: new Set(frozen.map((p) => p.id)),
        });
        await rejectStalePaymentRequests(tx, id, {
          actorId: userId,
          reason:
            'Lease terms changed. Please resubmit for the updated amounts.',
          at: now,
          touchedMonths: touched,
        });
      }

      // Applying/removing withholding changes the tenant's total on every
      // unpaid cycle, so their pending requests are stale too
      if (
        dto.applyWithholding !== undefined &&
        dto.applyWithholding !== lease.applyWithholding
      ) {
        const open = await tx.paymentPeriod.findMany({
          where: { leaseId: id, status: { in: ['unpaid', 'overdue'] } },
          select: { month: true },
        });
        await rejectStalePaymentRequests(tx, id, {
          actorId: userId,
          reason:
            'Tax settings changed. Please resubmit for the updated amounts.',
          at: now,
          touchedMonths: new Set(open.map((p) => p.month)),
        });
      }

      return result;
    });

    const userName = await this.getUserName(userId, userRole);
    await this.activityLogsService.create({
      action: 'update',
      entityType: 'lease',
      entityId: updated.id,
      userId,
      userName,
      userRole,
      buildingId,
      details: { changes: { ...dto } } as Prisma.InputJsonValue,
    });

    return updated;
  }

  async remove(
    id: string,
    buildingId: string,
    userId: string,
    userRole: string,
  ) {
    const lease = await this.prisma.lease.findFirst({
      where: whereActive({ id, buildingId }),
    });

    if (!lease) {
      throw new NotFoundException('Lease not found');
    }

    if (lease.status === 'active') {
      throw new ConflictException(
        'Cannot delete an active lease. Terminate it first, then you can remove it.',
      );
    }

    // Deleting hides the lease's periods from calendars and reports, so an
    // unpaid balance would silently disappear from receivables
    const outstanding = await this.prisma.paymentPeriod.count({
      where: { leaseId: id, status: { in: ['unpaid', 'overdue'] } },
    });
    if (outstanding > 0) {
      throw new ConflictException(
        `This lease still has ${outstanding} unpaid rent period(s). Record the payments before removing it.`,
      );
    }

    await this.softDeleteService.softDeleteLease(id, userId);

    const userName = await this.getUserName(userId, userRole);
    await this.activityLogsService.create({
      action: 'delete',
      entityType: 'lease',
      entityId: id,
      userId,
      userName,
      userRole,
      buildingId,
      details: {
        tenantId: lease.tenantId,
        unitId: lease.unitId,
      } as Prisma.InputJsonValue,
    });

    return { message: 'Lease deleted successfully' };
  }

  async findByTenant(buildingId: string, tenantId: string) {
    // Verify tenant belongs to this building
    const tenant = await this.prisma.tenant.findFirst({
      where: whereActive({ id: tenantId, buildingId }),
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found in this building');
    }

    return await this.prisma.lease.findMany({
      where: whereActive({ buildingId, tenantId }),
      include: leaseInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Ends an active lease early. The tenant owes rent up to and including the
   * effective date: later unpaid cycles are removed and the cycle containing
   * the date is prorated. Arrears stay owed; cycles already paid beyond the
   * date are kept and reported so the owner can settle a refund.
   */
  async terminate(
    id: string,
    buildingId: string,
    dto: TerminateLeaseDto,
    userId: string,
    userRole: string,
  ) {
    const lease = await this.prisma.lease.findFirst({
      where: whereActive({ id, buildingId }),
      include: leaseInclude,
    });

    if (!lease) {
      throw new NotFoundException('Lease not found');
    }

    if (lease.status !== 'active') {
      throw new ConflictException(`This lease is already ${lease.status}`);
    }

    const today = todayDate();
    const notStarted = lease.startDate > today;
    const requested = dto.effectiveDate ? toUtcDate(dto.effectiveDate) : today;

    if (requested > today) {
      throw new BadRequestException(
        'Termination date cannot be in the future. To plan a move-out, shorten the lease end date instead.',
      );
    }
    if (!notStarted && requested < lease.startDate) {
      throw new BadRequestException(
        'Termination date is before the lease started',
      );
    }
    if (requested > lease.endDate) {
      throw new BadRequestException('Termination date is after the lease ends');
    }

    // A lease cancelled before it starts owes nothing
    const effective = notStarted ? lease.startDate : requested;
    const now = new Date();
    const rent = Number(lease.rentAmount);

    const outcome = await this.prisma.$transaction(async (tx) => {
      const periods = await tx.paymentPeriod.findMany({
        where: { leaseId: id },
      });

      let removed = 0;
      let prorated = 0;
      let prepaidAfterEnd = 0;
      for (const p of periods) {
        if (!p.periodStart || !p.periodEnd) continue;
        const startsAfter = notStarted || p.periodStart > effective;

        if (p.status === 'paid') {
          if (startsAfter) prepaidAfterEnd++;
          continue;
        }
        if (startsAfter) {
          await tx.paymentPeriod.delete({ where: { id: p.id } });
          removed++;
        } else if (p.periodEnd > effective) {
          const days = daysBetweenInclusive(p.periodStart, effective);
          await tx.paymentPeriod.update({
            where: { id: p.id },
            data: {
              periodEnd: effective,
              daysInCycle: days,
              rentAmount: proratedRent(rent, days),
            },
          });
          prorated++;
        }
      }

      await tx.lease.update({
        where: { id },
        data: {
          status: 'terminated',
          endDate: effective,
          terminatedAt: now,
          terminationReason: dto.reason ?? null,
        },
      });

      const closure = await releaseLeaseResources(tx, lease, {
        actorId: userId,
        reason: 'Lease terminated',
        at: now,
      });

      const outstanding = await tx.paymentPeriod.aggregate({
        where: { leaseId: id, status: { in: ['unpaid', 'overdue'] } },
        _sum: { rentAmount: true },
        _count: true,
      });

      return {
        removedPeriods: removed,
        proratedPeriods: prorated,
        prepaidPeriodsAfterEnd: prepaidAfterEnd,
        outstandingPeriods: outstanding._count,
        outstandingRent: Number(outstanding._sum.rentAmount ?? 0),
        ...closure,
      };
    });

    const userName = await this.getUserName(userId, userRole);
    await this.activityLogsService.create({
      action: 'status_change',
      entityType: 'lease',
      entityId: id,
      userId,
      userName,
      userRole,
      buildingId,
      details: {
        status: 'terminated',
        effectiveDate: isoDate(effective),
        reason: dto.reason ?? null,
        ...outcome,
      } as Prisma.InputJsonValue,
    });

    await this.notificationsService.create({
      userId: lease.tenantId,
      userType: 'tenant',
      type: 'lease_terminated',
      title: 'Lease terminated',
      message: `Your lease for Unit ${lease.unit.unitNumber} ended on ${isoDate(effective)}.`,
      link: '/tenant/payments',
    });
    await this.emailService.sendLeaseTerminatedEmail(
      lease.tenant.email,
      lease.tenant.name,
      lease.unit.unitNumber,
      effective,
      outcome.outstandingRent,
    );

    return {
      message: 'Lease terminated successfully',
      effectiveDate: isoDate(effective),
      ...outcome,
    };
  }

  /**
   * Replaces every non-frozen period with cycles generated from `regenFrom`
   * to `end`. Returns the month keys that were removed or recreated.
   */
  private async regenerateFuturePeriods(
    tx: Tx,
    args: {
      leaseId: string;
      regenFrom: Date;
      end: Date;
      paymentDay: number;
      rent: number;
      frozenIds: Set<string>;
    },
  ): Promise<Set<string>> {
    const existing = await tx.paymentPeriod.findMany({
      where: { leaseId: args.leaseId },
      select: { id: true, month: true, periodStart: true },
    });
    // With history, only cycles after it are rebuilt (an unpaid cycle that
    // sits before a prepaid one keeps its terms); without history, all are
    const replaceable = existing.filter(
      (p) =>
        !args.frozenIds.has(p.id) &&
        (args.frozenIds.size === 0 ||
          (p.periodStart !== null && p.periodStart >= args.regenFrom)),
    );
    const touched = new Set(replaceable.map((p) => p.month));

    if (replaceable.length > 0) {
      await tx.paymentPeriod.deleteMany({
        where: { id: { in: replaceable.map((p) => p.id) } },
      });
    }

    if (args.regenFrom <= args.end) {
      const cycles = generateCycles(
        args.regenFrom,
        args.end,
        args.paymentDay,
        args.rent,
      );
      await tx.paymentPeriod.createMany({
        data: cycles.map((c) => ({
          leaseId: args.leaseId,
          month: c.month,
          periodStart: c.periodStart,
          periodEnd: c.periodEnd,
          daysInCycle: c.daysInCycle,
          rentAmount: c.rentAmount,
          status: 'unpaid' as const,
        })),
      });
      cycles.forEach((c) => touched.add(c.month));
    }

    return touched;
  }

  /** Any active lease on the unit whose dates intersect [start, end]. */
  private async assertNoOverlap(
    unitId: string,
    start: Date,
    end: Date,
    excludeLeaseId?: string,
  ) {
    const overlapping = await this.prisma.lease.findFirst({
      where: whereActive({
        unitId,
        status: 'active' as const,
        ...(excludeLeaseId && { id: { not: excludeLeaseId } }),
        startDate: { lte: end },
        endDate: { gte: start },
      }),
      select: { startDate: true, endDate: true },
    });

    if (overlapping) {
      throw new BadRequestException(
        `Unit already has an active lease from ${isoDate(overlapping.startDate)} to ${isoDate(overlapping.endDate)}`,
      );
    }
  }

  private async assertParkingCapacity(
    buildingId: string,
    totalLots: number,
    requested: number,
    excludeLeaseId?: string,
  ) {
    if (requested <= 0) return;
    if (totalLots <= 0) {
      throw new BadRequestException(
        'This building has no parking lots configured. Set the total parking lots on the building first.',
      );
    }
    const { _sum } = await this.prisma.lease.aggregate({
      where: {
        ...whereActive({ buildingId, status: 'active' as const }),
        ...(excludeLeaseId && { id: { not: excludeLeaseId } }),
      },
      _sum: { carsAllowed: true },
    });
    const usedLots = Number(_sum.carsAllowed ?? 0);
    if (usedLots + requested > totalLots) {
      const remaining = Math.max(0, totalLots - usedLots);
      throw new BadRequestException(
        `Not enough parking slots available. ${remaining} remaining.`,
      );
    }
  }

  private async getUserName(userId: string, userRole: string): Promise<string> {
    if (userRole === 'manager') {
      const manager = await this.prisma.manager.findFirst({
        where: whereActive({ id: userId }),
        select: { name: true },
      });
      return manager?.name || 'Unknown';
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    return user?.name || 'Unknown';
  }
}
