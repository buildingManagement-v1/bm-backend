import { randomBytes } from 'crypto';
import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { Prisma } from 'generated/prisma/browser';
import * as bcrypt from 'bcrypt';
import { EmailService } from 'src/common/email/email.service';
import { buildPageInfo } from 'src/common/pagination';
import { SoftDeleteService } from 'src/common/soft-delete/soft-delete.service';
import { whereActive } from 'src/common/soft-delete/soft-delete.scope';

@Injectable()
export class TenantsService {
  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
    private emailService: EmailService,
    private softDeleteService: SoftDeleteService,
  ) {}

  async create(
    buildingId: string,
    userId: string,
    userRole: string,
    dto: CreateTenantDto,
  ) {
    const existingTenant = await this.prisma.tenant.findFirst({
      where: whereActive({ buildingId, email: dto.email }),
    });

    if (existingTenant) {
      throw new ConflictException(
        'A tenant with this email already exists in this building',
      );
    }

    const temporaryPassword = this.generateTemporaryPassword(10);
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    const tenant = await this.prisma.tenant.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        tin: dto.tin,
        buildingId,
        passwordHash,
        status: 'inactive',
        mustResetPassword: true,
      },
    });

    const userName = await this.getUserName(userId, userRole);
    await this.activityLogsService.create({
      action: 'create',
      entityType: 'tenant',
      entityId: tenant.id,
      userId,
      userName,
      userRole,
      buildingId,
      details: {
        name: tenant.name,
        email: tenant.email,
      } as Prisma.InputJsonValue,
    });

    const building = await this.prisma.building.findFirst({
      where: whereActive({ id: buildingId }),
      select: { name: true },
    });

    await this.emailService.sendTenantCreatedEmail(
      tenant.email,
      tenant.name,
      building?.name || 'Your Building',
      temporaryPassword,
    );

    return {
      id: tenant.id,
      buildingId: tenant.buildingId,
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone,
      tin: tenant.tin,
      status: tenant.status,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  }

  private generateTemporaryPassword(length: number): string {
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
    const digits = '23456789';
    const all = lower + upper + digits;
    const bytes = randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i++) {
      result += all[bytes[i] % all.length];
    }
    return result;
  }

  async findAll(
    buildingId: string,
    limit = 20,
    offset = 0,
    filters?: { status?: string; q?: string },
  ) {
    const where: Prisma.TenantWhereInput = whereActive({ buildingId });
    if (filters?.status && ['active', 'inactive'].includes(filters.status)) {
      where.status = filters.status as 'active' | 'inactive';
    }
    if (filters?.q?.trim()) {
      const q = filters.q.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [totalCount, tenants] = await Promise.all([
      this.prisma.tenant.count({ where }),
      this.prisma.tenant.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);
    const data = tenants.map((tenant) => ({
      id: tenant.id,
      buildingId: tenant.buildingId,
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone,
      tin: tenant.tin,
      status: tenant.status,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    }));
    const page_info = buildPageInfo(limit, offset, totalCount);
    return { data, meta: { page_info } };
  }

  async findOne(id: string, buildingId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: whereActive({ id, buildingId }),
      include: {
        leases: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          include: {
            unit: {
              select: {
                id: true,
                unitNumber: true,
                floor: true,
              },
            },
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return {
      id: tenant.id,
      buildingId: tenant.buildingId,
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone,
      tin: tenant.tin,
      status: tenant.status,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
      leases: tenant.leases,
    };
  }

  async update(
    id: string,
    buildingId: string,
    userId: string,
    userRole: string,
    dto: UpdateTenantDto,
  ) {
    const tenant = await this.prisma.tenant.findFirst({
      where: whereActive({ id, buildingId }),
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (dto.email && dto.email !== tenant.email) {
      const existingTenant = await this.prisma.tenant.findFirst({
        where: whereActive({ buildingId, email: dto.email }),
      });

      if (existingTenant) {
        throw new ConflictException(
          'A tenant with this email already exists in this building',
        );
      }
    }

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: dto,
    });

    const userName = await this.getUserName(userId, userRole);
    await this.activityLogsService.create({
      action: 'update',
      entityType: 'tenant',
      entityId: updated.id,
      userId,
      userName,
      userRole,
      buildingId,
      details: { changes: { ...dto } } as Prisma.InputJsonValue,
    });

    return {
      id: updated.id,
      buildingId: updated.buildingId,
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      tin: updated.tin,
      status: updated.status,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async remove(
    id: string,
    buildingId: string,
    userId: string,
    userRole: string,
  ) {
    const tenant = await this.prisma.tenant.findFirst({
      where: whereActive({ id, buildingId }),
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const cascade = await this.softDeleteService.softDeleteTenant(id, userId);

    const userName = await this.getUserName(userId, userRole);
    await this.activityLogsService.create({
      action: 'delete',
      entityType: 'tenant',
      entityId: id,
      userId,
      userName,
      userRole,
      buildingId,
      details: {
        name: tenant.name,
        email: tenant.email,
        cascade: {
          leases: cascade.leases,
          unitsFreed: cascade.unitsFreed,
          parkingRegistrations: cascade.parkingRegistrations,
          maintenanceRequests: cascade.maintenanceRequests,
        },
      } as Prisma.InputJsonValue,
    });

    return { message: 'Tenant deleted successfully' };
  }

  async getDeletionPreview(id: string, buildingId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: whereActive({ id, buildingId }),
      select: { id: true, name: true, email: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const [
      activeLeases,
      unpaidPaymentPeriods,
      vehicles,
      pendingPaymentRequests,
      pendingParkingRequests,
      openMaintenanceRequests,
    ] = await Promise.all([
      this.prisma.lease.findMany({
        where: whereActive({ tenantId: id, status: 'active' as const }),
        select: {
          id: true,
          endDate: true,
          rentAmount: true,
          unit: { select: { unitNumber: true, floor: true } },
        },
      }),
      this.prisma.paymentPeriod.count({
        where: {
          status: { in: ['unpaid', 'overdue'] },
          lease: { tenantId: id, deletedAt: null },
        },
      }),
      this.prisma.parkingRegistration.count({
        where: whereActive({ tenantId: id }),
      }),
      this.prisma.tenantPaymentRequest.count({
        where: { tenantId: id, status: 'pending' },
      }),
      this.prisma.tenantParkingRequest.count({
        where: { tenantId: id, status: 'pending' },
      }),
      this.prisma.maintenanceRequest.count({
        where: whereActive({
          tenantId: id,
          status: { in: ['pending' as const, 'in_progress' as const] },
        }),
      }),
    ]);

    return {
      tenant,
      activeLeases: activeLeases.map((lease) => ({
        id: lease.id,
        unitNumber: lease.unit.unitNumber,
        floor: lease.unit.floor,
        endDate: lease.endDate,
        rentAmount: Number(lease.rentAmount),
      })),
      counts: {
        activeLeases: activeLeases.length,
        unpaidPaymentPeriods,
        vehicles,
        pendingPaymentRequests,
        pendingParkingRequests,
        openMaintenanceRequests,
      },
    };
  }

  async restore(
    id: string,
    buildingId: string,
    userId: string,
    userRole: string,
  ) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, buildingId, deletedAt: { not: null } },
      select: { id: true, name: true, email: true },
    });

    if (!tenant) {
      throw new NotFoundException('Deleted tenant not found');
    }

    const existingTenant = await this.prisma.tenant.findFirst({
      where: whereActive({ buildingId, email: tenant.email }),
    });
    if (existingTenant) {
      throw new ConflictException(
        'A tenant with this email already exists in this building',
      );
    }

    const result = await this.softDeleteService.restoreTenant(id);

    const userName = await this.getUserName(userId, userRole);
    await this.activityLogsService.create({
      action: 'update',
      entityType: 'tenant',
      entityId: id,
      userId,
      userName,
      userRole,
      buildingId,
      details: {
        restored: true,
        name: tenant.name,
        email: tenant.email,
        restoredLeases: result.restoredLeases,
        unitConflicts: result.unitConflicts,
      } as Prisma.InputJsonValue,
    });

    return { message: 'Tenant restored successfully' };
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
