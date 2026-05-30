import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from 'generated/prisma/client';
import { CreateLeaseDto, UpdateLeaseDto } from './dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { EmailService } from 'src/common/email/email.service';
import { SoftDeleteService } from 'src/common/soft-delete/soft-delete.service';
import { whereActive } from 'src/common/soft-delete/soft-delete.scope';

const leaseInclude = {
  tenant: { select: { id: true, name: true, email: true } },
  unit: { select: { id: true, unitNumber: true, floor: true } },
} satisfies Prisma.LeaseInclude;

@Injectable()
export class LeasesService {
  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
    private emailService: EmailService,
    private softDeleteService: SoftDeleteService,
  ) {}

  async create(
    buildingId: string,
    dto: CreateLeaseDto,
    userId: string,
    userRole: string,
  ) {
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

    const effectivePaymentDay = dto.useDefaultPaymentDay
      ? (building?.paymentCollectionDay ?? null)
      : (dto.paymentCollectionDay ?? null);

    const totalLots = building?.totalParkingLots ?? 0;
    if (totalLots > 0) {
      const { _sum } = await this.prisma.lease.aggregate({
        where: whereActive({ buildingId, status: 'active' as const }),
        _sum: { carsAllowed: true },
      });
      const usedLots = Number(_sum.carsAllowed ?? 0);
      const requested = dto.carsAllowed ?? 0;
      if (usedLots + requested > totalLots) {
        const remaining = Math.max(0, totalLots - usedLots);
        throw new BadRequestException(
          `Not enough parking slots available. ${remaining} remaining.`,
        );
      }
    }

    const overlapping = await this.prisma.lease.findFirst({
      where: whereActive({
        unitId: dto.unitId,
        status: 'active' as const,
        OR: [
          {
            AND: [
              { startDate: { lte: new Date(dto.startDate) } },
              { endDate: { gte: new Date(dto.startDate) } },
            ],
          },
          {
            AND: [
              { startDate: { lte: new Date(dto.endDate) } },
              { endDate: { gte: new Date(dto.endDate) } },
            ],
          },
        ],
      }),
    });

    if (overlapping) {
      throw new BadRequestException('Unit has an overlapping active lease');
    }

    const lease = await this.prisma.$transaction(async (tx) => {
      // Create lease
      const newLease = await tx.lease.create({
        data: {
          buildingId,
          tenantId: dto.tenantId,
          unitId: dto.unitId,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          rentAmount: dto.rentAmount,
          securityDeposit: dto.securityDeposit ?? undefined,
          carsAllowed: dto.carsAllowed ?? 0,
          useDefaultPaymentDay: dto.useDefaultPaymentDay,
          paymentCollectionDay: effectivePaymentDay,
          applyWithholding: dto.applyWithholding,
          status: dto.status || 'active',
          terms: dto.terms as Prisma.InputJsonValue,
        },
        include: leaseInclude,
      });

      // Update unit to occupied and sync rent price with the lease
      await tx.unit.update({
        where: { id: dto.unitId },
        data: { status: 'occupied', rentPrice: dto.rentAmount },
      });

      // Activate tenant
      await tx.tenant.update({
        where: { id: dto.tenantId },
        data: { status: 'active' },
      });

      // Generate cycle-based payment periods
      const paymentDay = newLease.paymentCollectionDay ?? 1;
      const cycles = this.generateCycles(
        new Date(dto.startDate),
        new Date(dto.endDate),
        paymentDay,
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

    // If status is being changed to terminated, use terminate method
    if (dto.status === 'terminated' && lease.status !== 'terminated') {
      return await this.terminate(id, buildingId, userId, userRole);
    }

    // Prevent editing terminated leases
    if (lease.status === 'terminated') {
      throw new ConflictException('Cannot edit a terminated lease');
    }

    if (dto.carsAllowed !== undefined) {
      const building = await this.prisma.building.findFirst({
        where: { id: buildingId },
        select: { totalParkingLots: true },
      });
      const totalLots = building?.totalParkingLots ?? 0;
      if (totalLots > 0) {
        const { _sum } = await this.prisma.lease.aggregate({
          where: {
            ...whereActive({ buildingId, status: 'active' as const }),
            id: { not: id },
          },
          _sum: { carsAllowed: true },
        });
        const usedLots = Number(_sum.carsAllowed ?? 0);
        if (usedLots + dto.carsAllowed > totalLots) {
          const remaining = Math.max(0, totalLots - usedLots);
          throw new BadRequestException(
            `Not enough parking slots available. ${remaining} remaining.`,
          );
        }
      }
    }

    const updated = await this.prisma.lease.update({
      where: { id },
      data: {
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        rentAmount: dto.rentAmount,
        securityDeposit: dto.securityDeposit,
        carsAllowed: dto.carsAllowed,
        useDefaultPaymentDay: dto.useDefaultPaymentDay,
        paymentCollectionDay: dto.paymentCollectionDay,
        applyWithholding: dto.applyWithholding,
        status: dto.status,
        terms: dto.terms as Prisma.InputJsonValue,
      },
      include: leaseInclude,
    });

    if (dto.rentAmount !== undefined) {
      await this.prisma.unit.update({
        where: { id: lease.unitId },
        data: { rentPrice: dto.rentAmount },
      });
    }

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
        'Cannot delete an active lease. End the lease first, then you can remove it.',
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

  private generateCycles(
    startDate: Date,
    endDate: Date,
    paymentDay: number,
    monthlyRent: number,
  ): Array<{
    month: string;
    periodStart: Date;
    periodEnd: Date;
    daysInCycle: number;
    rentAmount: number;
  }> {
    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    const toUTC = (d: Date) =>
      new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

    const end = toUTC(endDate);
    let cursor = toUTC(startDate);
    const cycles: Array<{
      month: string;
      periodStart: Date;
      periodEnd: Date;
      daysInCycle: number;
      rentAmount: number;
    }> = [];

    while (cursor <= end) {
      // Next occurrence of paymentDay strictly after cursor
      const lookFrom = new Date(cursor.getTime() + MS_PER_DAY);
      let nextPaymentDate: Date;
      if (lookFrom.getUTCDate() <= paymentDay) {
        nextPaymentDate = new Date(
          Date.UTC(
            lookFrom.getUTCFullYear(),
            lookFrom.getUTCMonth(),
            paymentDay,
          ),
        );
      } else {
        nextPaymentDate = new Date(
          Date.UTC(
            lookFrom.getUTCFullYear(),
            lookFrom.getUTCMonth() + 1,
            paymentDay,
          ),
        );
      }

      const dayBeforeNext = new Date(nextPaymentDate.getTime() - MS_PER_DAY);
      const cycleEnd =
        dayBeforeNext <= end ? dayBeforeNext : new Date(end.getTime());

      const daysInCycle =
        Math.round((cycleEnd.getTime() - cursor.getTime()) / MS_PER_DAY) + 1;

      // Full cycle: starts exactly on paymentDay and wasn't truncated by endDate
      const isFullCycle =
        cursor.getUTCDate() === paymentDay &&
        cycleEnd.getTime() === dayBeforeNext.getTime();

      const rentAmount = isFullCycle
        ? Number(monthlyRent)
        : Math.round((Number(monthlyRent) / 30) * daysInCycle * 100) / 100;

      // Use periodStart ISO date as month key — always unique per lease
      const y = cursor.getUTCFullYear();
      const m = String(cursor.getUTCMonth() + 1).padStart(2, '0');
      const d = String(cursor.getUTCDate()).padStart(2, '0');

      cycles.push({
        month: `${y}-${m}-${d}`,
        periodStart: new Date(cursor.getTime()),
        periodEnd: new Date(cycleEnd.getTime()),
        daysInCycle,
        rentAmount,
      });

      cursor = new Date(cycleEnd.getTime() + MS_PER_DAY);
    }

    return cycles;
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

  async terminate(
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

    await this.prisma.$transaction(async (tx) => {
      // Terminate lease
      await tx.lease.update({
        where: { id },
        data: { status: 'terminated' },
      });

      // Free the unit
      await tx.unit.update({
        where: { id: lease.unitId },
        data: { status: 'vacant' },
      });
    });

    const userName = await this.getUserName(userId, userRole);
    await this.activityLogsService.create({
      action: 'update',
      entityType: 'lease',
      entityId: id,
      userId,
      userName,
      userRole,
      buildingId,
      details: { status: 'terminated' } as Prisma.InputJsonValue,
    });

    return { message: 'Lease terminated successfully' };
  }
}
