import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAllOwners(query: {
    search?: string;
    status?: 'active' | 'inactive';
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { deletedAt: undefined };
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
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data: users, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateOwnerStatus(id: string, status: 'active' | 'inactive') {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id },
      data: { status },
      select: { id: true, name: true, email: true, status: true },
    });
    return updated;
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

    const where: any = { deletedAt: null };
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

  async updateManagerStatus(id: string, status: 'active' | 'inactive') {
    const manager = await this.prisma.manager.findFirst({
      where: { id, deletedAt: null },
    });
    if (!manager) throw new NotFoundException('Manager not found');

    const updated = await this.prisma.manager.update({
      where: { id },
      data: { status },
      select: { id: true, name: true, email: true, status: true },
    });
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

    const where: any = { deletedAt: null };
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

  async updateTenantStatus(id: string, status: 'active' | 'inactive') {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, deletedAt: null },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: { status },
      select: { id: true, name: true, email: true, status: true },
    });
    return updated;
  }
}
