import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from 'generated/prisma/client';
import { CreateLeaseDto, UpdateLeaseDto } from './dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { EmailService } from 'src/common/email/email.service';

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
  ) {}

  async create(
    buildingId: string,
    dto: CreateLeaseDto,
    userId: string,
    userRole: string,
  ) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: dto.tenantId, buildingId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found in this building');
    }

    const unit = await this.prisma.unit.findFirst({
      where: { id: dto.unitId, buildingId },
    });

    if (!unit) {
      throw new NotFoundException('Unit not found in this building');
    }

    const overlapping = await this.prisma.lease.findFirst({
      where: {
        unitId: dto.unitId,
        status: 'active',
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
      },
    });

    if (overlapping) {
      throw new BadRequestException('Unit has an overlapping active lease');
    }

    const lease = await this.prisma.$transaction(async (tx) => {
      const newLease = await tx.lease.create({
        data: {
          buildingId,
          tenantId: dto.tenantId,
          unitId: dto.unitId,
          startDate: new Date(dto.startDate),
          endDate: new Date(dto.endDate),
          rentAmount: dto.rentAmount,
          securityDeposit: dto.securityDeposit,
          status: dto.status || 'active',
          terms: dto.terms as Prisma.InputJsonValue,
        },
        include: leaseInclude,
      });

      // Generate payment periods for lease duration
      const months = this.generateMonthsBetween(
        new Date(dto.startDate),
        new Date(dto.endDate),
      );

      await tx.paymentPeriod.createMany({
        data: months.map((month) => ({
          leaseId: newLease.id,
          month,
          rentAmount: dto.rentAmount,
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
      where: { buildingId },
      include: leaseInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, buildingId: string) {
    const lease = await this.prisma.lease.findFirst({
      where: { id, buildingId },
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
      where: { id, buildingId },
    });

    if (!lease) {
      throw new NotFoundException('Lease not found');
    }

    const updated = await this.prisma.lease.update({
      where: { id },
      data: {
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        rentAmount: dto.rentAmount,
        securityDeposit: dto.securityDeposit,
        status: dto.status,
        terms: dto.terms as Prisma.InputJsonValue,
      },
      include: leaseInclude,
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
      where: { id, buildingId },
    });

    if (!lease) {
      throw new NotFoundException('Lease not found');
    }

    await this.prisma.lease.delete({
      where: { id },
    });

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

  private generateMonthsBetween(start: Date, end: Date): string[] {
    const months: string[] = [];
    const current = new Date(start.getFullYear(), start.getMonth(), 1);
    const endDate = new Date(end.getFullYear(), end.getMonth(), 1);

    while (current <= endDate) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      months.push(`${year}-${month}`);
      current.setMonth(current.getMonth() + 1);
    }

    return months;
  }

  private async getUserName(userId: string, userRole: string): Promise<string> {
    if (userRole === 'manager') {
      const manager = await this.prisma.manager.findUnique({
        where: { id: userId },
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
      where: { id: tenantId, buildingId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found in this building');
    }

    return await this.prisma.lease.findMany({
      where: {
        buildingId,
        tenantId,
      },
      include: leaseInclude,
      orderBy: { createdAt: 'desc' },
    });
  }
}
