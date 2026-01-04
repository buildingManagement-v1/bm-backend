import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async create(buildingId: string, userId: string, dto: CreateTenantDto) {
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { email: dto.email },
    });

    if (existingTenant) {
      throw new ConflictException('Tenant with this email already exists');
    }

    if (dto.unitId) {
      const unit = await this.prisma.unit.findFirst({
        where: { id: dto.unitId, buildingId },
      });

      if (!unit) {
        throw new NotFoundException('Unit not found in this building');
      }

      if (unit.status === 'occupied') {
        throw new ConflictException('Unit is already occupied');
      }
    }

    const tenant = await this.prisma.tenant.create({
      data: {
        ...dto,
        buildingId,
      },
      include: {
        unit: {
          select: {
            id: true,
            unitNumber: true,
            floor: true,
          },
        },
      },
    });

    if (dto.unitId) {
      await this.prisma.unit.update({
        where: { id: dto.unitId },
        data: { status: 'occupied' },
      });
    }

    return {
      id: tenant.id,
      buildingId: tenant.buildingId,
      unitId: tenant.unitId,
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone,
      status: tenant.status,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
      unit: tenant.unit,
    };
  }

  async findAll(buildingId: string) {
    const tenants = await this.prisma.tenant.findMany({
      where: { buildingId },
      include: {
        unit: {
          select: {
            id: true,
            unitNumber: true,
            floor: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return tenants.map((tenant) => ({
      id: tenant.id,
      buildingId: tenant.buildingId,
      unitId: tenant.unitId,
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone,
      status: tenant.status,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
      unit: tenant.unit,
    }));
  }

  async findOne(id: string, buildingId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, buildingId },
      include: {
        unit: {
          select: {
            id: true,
            unitNumber: true,
            floor: true,
          },
        },
        leases: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            startDate: true,
            endDate: true,
            rentAmount: true,
            status: true,
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
      unitId: tenant.unitId,
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone,
      status: tenant.status,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
      unit: tenant.unit,
      leases: tenant.leases,
    };
  }

  async update(
    id: string,
    buildingId: string,
    userId: string,
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

    if (dto.unitId !== undefined) {
      if (dto.unitId && dto.unitId !== tenant.unitId) {
        const newUnit = await this.prisma.unit.findFirst({
          where: { id: dto.unitId, buildingId },
        });

        if (!newUnit) {
          throw new NotFoundException('Unit not found in this building');
        }

        if (newUnit.status === 'occupied') {
          throw new ConflictException('Unit is already occupied');
        }

        if (tenant.unitId) {
          await this.prisma.unit.update({
            where: { id: tenant.unitId },
            data: { status: 'vacant' },
          });
        }

        await this.prisma.unit.update({
          where: { id: dto.unitId },
          data: { status: 'occupied' },
        });
      } else if (dto.unitId === null && tenant.unitId) {
        await this.prisma.unit.update({
          where: { id: tenant.unitId },
          data: { status: 'vacant' },
        });
      }
    }

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: dto,
      include: {
        unit: {
          select: {
            id: true,
            unitNumber: true,
            floor: true,
          },
        },
      },
    });

    return {
      id: updated.id,
      buildingId: updated.buildingId,
      unitId: updated.unitId,
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      status: updated.status,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      unit: updated.unit,
    };
  }

  async remove(id: string, buildingId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, buildingId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (tenant.unitId) {
      await this.prisma.unit.update({
        where: { id: tenant.unitId },
        data: { status: 'vacant' },
      });
    }

    await this.prisma.tenant.delete({
      where: { id },
    });

    return { message: 'Tenant deleted successfully' };
  }
}
