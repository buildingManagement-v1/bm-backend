import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { SoftDeleteService } from '../../../common/soft-delete/soft-delete.service';
import { UserDeletionService } from '../../../common/user-deletion/user-deletion.service';
import { EmailService } from '../../../common/email/email.service';
import { OtpType, Prisma, UserType } from 'generated/prisma/client';
import { TokenService } from 'src/common/token/token.service';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { BillingService } from 'src/modules/billing/billing.service';
import { ActivityLogsService } from 'src/modules/user/activity-logs/activity-logs.service';
import { parsePlanFeatures } from 'src/common/types/plan-features.interface';
import { CreateOwnerDto } from './dto';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private softDeleteService: SoftDeleteService,
    private userDeletionService: UserDeletionService,
    private emailService: EmailService,
    private billingService: BillingService,
    private activityLogsService: ActivityLogsService,
    private tokenService: TokenService,
  ) {}

  async findAllOwners(query: {
    search?: string;
    status?: 'active' | 'inactive';
    deleted?: boolean;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      deletedAt: query.deleted ? { not: null } : null,
    };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          deletedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    const data = users.map((u) => ({
      ...u,
      purgeAt: u.deletedAt
        ? this.userDeletionService.purgeDateFor(u.deletedAt)
        : null,
    }));

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async softDeleteOwner(id: string, adminId: string) {
    const [user, admin] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id },
        select: { id: true, name: true, email: true, deletedAt: true },
      }),
      this.prisma.platformAdmin.findUnique({
        where: { id: adminId },
        select: { name: true },
      }),
    ]);
    if (!user || user.deletedAt) throw new NotFoundException('User not found');

    const deletedAt = await this.softDeleteService.softDeleteUser(id, adminId);
    const purgeAt = this.userDeletionService.purgeDateFor(deletedAt);

    await this.prisma.platformActivityLog.create({
      data: {
        action: 'delete',
        entityType: 'user',
        entityId: id,
        adminId,
        adminName: admin?.name ?? 'Unknown admin',
        details: { email: user.email, purgeAt: purgeAt.toISOString() },
      },
    });

    try {
      await this.emailService.sendAccountDeletionScheduledEmail(
        user.email,
        user.name,
        purgeAt,
      );
    } catch (error) {
      console.error(error);
    }

    return { id: user.id, email: user.email, deletedAt, purgeAt };
  }

  async restoreOwner(id: string, adminId: string) {
    const [user, admin] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id },
        select: { id: true, name: true, email: true, deletedAt: true },
      }),
      this.prisma.platformAdmin.findUnique({
        where: { id: adminId },
        select: { name: true },
      }),
    ]);
    if (!user) throw new NotFoundException('User not found');
    if (!user.deletedAt) {
      throw new ConflictException('User is not scheduled for deletion');
    }

    await this.softDeleteService.restoreUser(id);

    await this.prisma.platformActivityLog.create({
      data: {
        action: 'update',
        entityType: 'user',
        entityId: id,
        adminId,
        adminName: admin?.name ?? 'Unknown admin',
        details: { email: user.email, restored: true },
      },
    });

    try {
      await this.emailService.sendAccountRestoredEmail(user.email, user.name);
    } catch (error) {
      console.error(error);
    }

    return { id: user.id, email: user.email };
  }

  async updateOwnerStatus(
    id: string,
    status: 'active' | 'inactive',
    admin: { id: string; name: string },
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id },
      data: { status },
      select: { id: true, name: true, email: true, status: true },
    });
    await this.logStatus('user', id, status, admin);
    return updated;
  }

  /**
   * Creates an owner account on their behalf: a temporary password is
   * emailed and must be changed at first login; the owner gets the one-time
   * Free trial like a self-registered owner.
   */
  async createOwner(dto: CreateOwnerDto, admin: { id: string; name: string }) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException(
        existing.deletedAt
          ? 'This email belongs to an account pending deletion. Restore it instead.'
          : 'An owner with this email already exists',
      );
    }

    const temporaryPassword = randomBytes(9).toString('base64url');
    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email,
        phone: dto.phone?.trim() || null,
        passwordHash: await bcrypt.hash(temporaryPassword, 10),
        mustResetPassword: true,
      },
      select: { id: true, name: true, email: true, phone: true, status: true },
    });
    await this.billingService.startTrial(user.id);

    await this.emailService.sendOwnerAccountCreatedEmail(
      user.email,
      user.name,
      temporaryPassword,
    );
    await this.activityLogsService.createPlatformLog({
      action: 'create',
      entityType: 'user',
      entityId: user.id,
      adminId: admin.id,
      adminName: admin.name,
      details: { email: user.email } as Prisma.InputJsonValue,
    });
    return user;
  }

  /** Emails the owner a reset code, as if they had used "Forgot password". */
  async sendOwnerPasswordReset(
    id: string,
    admin: { id: string; name: string },
  ) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, email: true, status: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.status === 'inactive') {
      throw new ConflictException(
        'Activate the account before sending a reset',
      );
    }
    const otp = await this.tokenService.createOTP(
      user.id,
      UserType.user,
      OtpType.password_reset,
      10,
    );
    await this.emailService.sendUserPasswordResetEmail(user.email, otp);
    await this.activityLogsService.createPlatformLog({
      action: 'update',
      entityType: 'user',
      entityId: user.id,
      adminId: admin.id,
      adminName: admin.name,
      details: {
        email: user.email,
        passwordResetSent: true,
      } as Prisma.InputJsonValue,
    });
    return { message: `Password reset code sent to ${user.email}` };
  }

  /** Everything support needs about one owner. */
  async getOwnerDetail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        status: true,
        mustResetPassword: true,
        lastLoginAt: true,
        deletedAt: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const [subscriptions, requests, buildings, managers] = await Promise.all([
      this.prisma.subscription.findMany({
        where: { userId: id },
        include: {
          plan: {
            select: { id: true, name: true, price: true, features: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.subscriptionRequest.findMany({
        where: { userId: id },
        include: { plan: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.building.findMany({
        where: { userId: id, deletedAt: null },
        select: {
          id: true,
          name: true,
          city: true,
          createdAt: true,
          units: {
            where: { deletedAt: null },
            select: { status: true },
          },
          _count: {
            select: {
              tenants: { where: { deletedAt: null, status: 'active' } },
              leases: { where: { deletedAt: null, status: 'active' } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.manager.count({
        where: { userId: id, deletedAt: null, status: 'active' },
      }),
    ]);

    const now = new Date();
    const active =
      subscriptions.find(
        (s) => s.status === 'active' && s.billingCycleEnd >= now,
      ) ?? null;
    const limits = active ? parsePlanFeatures(active.plan.features) : null;

    return {
      ...user,
      subscription: active,
      subscriptionHistory: subscriptions,
      requests,
      usage: {
        buildings: buildings.length,
        managers,
        maxUnitsInABuilding: Math.max(
          0,
          ...buildings.map(
            (b) => b.units.filter((u) => u.status !== 'inactive').length,
          ),
        ),
        limits,
      },
      buildings: buildings.map((b) => {
        const total = b.units.filter((u) => u.status !== 'inactive').length;
        const occupied = b.units.filter((u) => u.status === 'occupied').length;
        return {
          id: b.id,
          name: b.name,
          city: b.city,
          createdAt: b.createdAt,
          units: total,
          occupiedUnits: occupied,
          occupancyRate: total ? Math.round((occupied / total) * 1000) / 10 : 0,
          activeTenants: b._count.tenants,
          activeLeases: b._count.leases,
        };
      }),
    };
  }

  private async logStatus(
    entityType: 'user' | 'manager' | 'tenant',
    entityId: string,
    status: string,
    admin: { id: string; name: string },
  ) {
    await this.activityLogsService.createPlatformLog({
      action: 'status_change',
      entityType,
      entityId,
      adminId: admin.id,
      adminName: admin.name,
      details: { status } as Prisma.InputJsonValue,
    });
  }

  async findAllManagers(query: {
    search?: string;
    status?: 'active' | 'inactive';
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ManagerWhereInput = { deletedAt: null };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [managers, total] = await Promise.all([
      this.prisma.manager.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true,
          userId: true,
          buildingRoles: {
            where: { deletedAt: null },
            select: {
              roles: true,
              building: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.manager.count({ where }),
    ] as const);

    const data = managers.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      phone: m.phone,
      status: m.status,
      createdAt: m.createdAt,
      ownerId: m.userId,
      buildingCount: m.buildingRoles.length,
      buildings: m.buildingRoles.map((r) => ({
        id: r.building.id,
        name: r.building.name,
        roles: r.roles,
      })),
    }));

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateManagerStatus(
    id: string,
    status: 'active' | 'inactive',
    admin: { id: string; name: string },
  ) {
    const manager = await this.prisma.manager.findFirst({
      where: { id, deletedAt: null },
    });
    if (!manager) throw new NotFoundException('Manager not found');

    const updated = await this.prisma.manager.update({
      where: { id },
      data: { status },
      select: { id: true, name: true, email: true, status: true },
    });
    await this.logStatus('manager', id, status, admin);
    return updated;
  }

  async findAllTenants(query: {
    search?: string;
    status?: 'active' | 'inactive';
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.TenantWhereInput = { deletedAt: null };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          createdAt: true,
          building: { select: { id: true, name: true, city: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.tenant.count({ where }),
    ]);

    const data = tenants.map((t) => ({
      id: t.id,
      name: t.name,
      email: t.email,
      phone: t.phone,
      status: t.status,
      createdAt: t.createdAt,
      buildingId: t.building.id,
      buildingName: t.building.name,
      buildingCity: t.building.city,
    }));

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateTenantStatus(
    id: string,
    status: 'active' | 'inactive',
    admin: { id: string; name: string },
  ) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, deletedAt: null },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: { status },
      select: { id: true, name: true, email: true, status: true },
    });
    await this.logStatus('tenant', id, status, admin);
    return updated;
  }
}
