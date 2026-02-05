import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { OnboardTenantDto } from './dto/onboard-tenant.dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { Prisma } from 'generated/prisma/browser';
import * as bcrypt from 'bcrypt';
import { EmailService } from 'src/common/email/email.service';

@Injectable()
export class TenantsService {
  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
    private emailService: EmailService,
  ) {}

  async create(
    buildingId: string,
    userId: string,
    userRole: string,
    dto: CreateTenantDto,
  ) {
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { email: dto.email },
    });

    if (existingTenant) {
      throw new ConflictException('Tenant with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _password, ...tenantData } = dto;

    const tenant = await this.prisma.tenant.create({
      data: {
        ...tenantData,
        buildingId,
        passwordHash,
        status: 'inactive',
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

    const building = await this.prisma.building.findUnique({
      where: { id: buildingId },
      select: { name: true },
    });

    await this.emailService.sendTenantCreatedEmail(
      tenant.email,
      tenant.name,
      building?.name || 'Your Building',
    );

    return {
      id: tenant.id,
      buildingId: tenant.buildingId,
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone,
      status: tenant.status,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  }

  async findAll(buildingId: string) {
    const tenants = await this.prisma.tenant.findMany({
      where: { buildingId },
      orderBy: { createdAt: 'desc' },
    });

    return tenants.map((tenant) => ({
      id: tenant.id,
      buildingId: tenant.buildingId,
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone,
      status: tenant.status,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    }));
  }

  async findOne(id: string, buildingId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, buildingId },
      include: {
        leases: {
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
      where: { id, buildingId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (dto.email && dto.email !== tenant.email) {
      const existingTenant = await this.prisma.tenant.findUnique({
        where: { email: dto.email },
      });

      if (existingTenant) {
        throw new ConflictException('Tenant with this email already exists');
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
      where: { id, buildingId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    await this.prisma.tenant.delete({
      where: { id },
    });

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
      } as Prisma.InputJsonValue,
    });

    return { message: 'Tenant deleted successfully' };
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

  async onboard(
    buildingId: string,
    userId: string,
    userRole: string,
    dto: OnboardTenantDto,
  ) {
    // Validate tenant email doesn't exist
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { email: dto.email },
    });

    if (existingTenant) {
      throw new ConflictException('Tenant with this email already exists');
    }

    // Validate unit exists and is vacant
    const unit = await this.prisma.unit.findFirst({
      where: { id: dto.unitId, buildingId },
    });

    if (!unit) {
      throw new NotFoundException('Unit not found in this building');
    }

    if (unit.status === 'occupied') {
      throw new ConflictException('Unit is already occupied');
    }

    // Validate lease dates
    const startDate = new Date(dto.leaseStartDate);
    const endDate = new Date(dto.leaseEndDate);

    if (endDate <= startDate) {
      throw new ConflictException('Lease end date must be after start date');
    }

    // Create everything in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Hash password if provided
      let passwordHash: string | undefined;
      if (dto.password) {
        passwordHash = await bcrypt.hash(dto.password, 10);
      }

      // 1. Create tenant
      const tenant = await tx.tenant.create({
        data: {
          buildingId,
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          passwordHash,
        },
      });

      // 2. Update unit status to occupied
      await tx.unit.update({
        where: { id: dto.unitId },
        data: { status: 'occupied' },
      });

      // 3. Create lease
      const lease = await tx.lease.create({
        data: {
          buildingId,
          tenantId: tenant.id,
          unitId: dto.unitId,
          startDate,
          endDate,
          rentAmount: dto.rentAmount,
          securityDeposit: dto.securityDeposit || 0,
          terms: dto.notes ? { notes: dto.notes } : undefined,
          status: 'active',
        },
      });

      // 4. Generate payment periods
      const periods: { month: string; rentAmount: number }[] = [];
      const current = new Date(startDate);

      while (current <= endDate) {
        const monthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
        periods.push({
          month: monthKey,
          rentAmount: dto.rentAmount,
        });
        current.setMonth(current.getMonth() + 1);
      }

      await tx.paymentPeriod.createMany({
        data: periods.map((p) => ({
          leaseId: lease.id,
          month: p.month,
          rentAmount: p.rentAmount,
          status: 'unpaid',
        })),
      });

      return { tenant, lease };
    });

    // Activity log
    const userName = await this.getUserName(userId, userRole);
    await this.activityLogsService.create({
      action: 'create',
      entityType: 'tenant',
      entityId: result.tenant.id,
      userId,
      userName,
      userRole,
      buildingId,
      details: {
        name: result.tenant.name,
        email: result.tenant.email,
        leaseCreated: true,
      } as Prisma.InputJsonValue,
    });

    // Send email
    const building = await this.prisma.building.findUnique({
      where: { id: buildingId },
      select: { name: true },
    });

    await this.emailService.sendTenantCreatedEmail(
      result.tenant.email,
      result.tenant.name,
      building?.name || 'Your Building',
    );

    await this.emailService.sendLeaseCreatedEmail(
      result.tenant.email,
      result.tenant.name,
      unit.unitNumber,
      startDate,
      endDate,
      dto.rentAmount,
    );

    // Return complete data
    const tenantWithDetails = await this.prisma.tenant.findUnique({
      where: { id: result.tenant.id },
      include: {
        leases: {
          where: { id: result.lease.id },
          include: {
            unit: true,
            paymentPeriods: {
              orderBy: { month: 'asc' },
            },
          },
        },
      },
    });

    return tenantWithDetails;
  }
}
