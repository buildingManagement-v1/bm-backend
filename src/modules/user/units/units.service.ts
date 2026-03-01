import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateUnitDto, UpdateUnitDto } from './dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { Prisma } from 'generated/prisma/browser';
import { PlanLimitsService } from 'src/common/plan-limits/plan-limits.service';
import { buildPageInfo } from 'src/common/pagination';
import { SoftDeleteService } from 'src/common/soft-delete/soft-delete.service';
import { whereActive } from 'src/common/soft-delete/soft-delete.scope';

@Injectable()
export class UnitsService {
  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
    private planLimitsService: PlanLimitsService,
    private softDeleteService: SoftDeleteService,
  ) {}

  async create(
    buildingId: string,
    dto: CreateUnitDto,
    userId: string,
    userRole: string,
  ) {
    await this.planLimitsService.canCreateUnit(buildingId);

    const existingUnit = await this.prisma.unit.findFirst({
      where: whereActive({ buildingId, unitNumber: dto.unitNumber }),
    });

    if (existingUnit) {
      throw new BadRequestException(
        'Unit number already exists in this building',
      );
    }

    const unit = await this.prisma.unit.create({
      data: {
        buildingId,
        unitNumber: dto.unitNumber,
        floor: dto.floor,
        size: dto.size,
        type: dto.type,
        rentPrice: dto.rentPrice,
        status: dto.status,
      },
      include: {
        building: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const userName = await this.getUserName(userId, userRole);

    await this.activityLogsService.create({
      action: 'create',
      entityType: 'unit',
      entityId: unit.id,
      userId,
      userName,
      userRole,
      buildingId,
      details: { unitNumber: unit.unitNumber, type: unit.type },
    });

    return unit;
  }

  async findAll(
    buildingId: string,
    limit = 20,
    offset = 0,
    filters?: { status?: string; q?: string },
  ) {
    const where: Prisma.UnitWhereInput = whereActive({ buildingId });
    if (
      filters?.status &&
      ['vacant', 'occupied', 'inactive'].includes(filters.status)
    ) {
      where.status = filters.status as 'vacant' | 'occupied' | 'inactive';
    }
    if (filters?.q?.trim()) {
      where.unitNumber = { contains: filters.q.trim(), mode: 'insensitive' };
    }
    const [totalCount, data] = await Promise.all([
      this.prisma.unit.count({ where }),
      this._findManyUnits(where, limit, offset),
    ]);
    const page_info = buildPageInfo(limit, offset, totalCount);
    return { data, meta: { page_info } };
  }

  private async _findManyUnits(
    where: Prisma.UnitWhereInput,
    limit: number,
    offset: number,
  ) {
    return this.prisma.unit.findMany({
      where,
      include: {
        building: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async findOne(buildingId: string, id: string) {
    const unit = await this.prisma.unit.findFirst({
      where: whereActive({ id }),
      include: {
        building: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!unit) {
      throw new NotFoundException('Unit not found');
    }

    if (unit.buildingId !== buildingId) {
      throw new NotFoundException('Unit not found in this building');
    }

    return unit;
  }

  async update(
    buildingId: string,
    id: string,
    dto: UpdateUnitDto,
    userId: string,
    userRole: string,
  ) {
    const unit = await this.prisma.unit.findFirst({
      where: whereActive({ id }),
    });

    if (!unit) {
      throw new NotFoundException('Unit not found');
    }

    if (unit.buildingId !== buildingId) {
      throw new NotFoundException('Unit not found in this building');
    }

    if (dto.unitNumber && dto.unitNumber !== unit.unitNumber) {
      const existingUnit = await this.prisma.unit.findFirst({
        where: whereActive({ buildingId, unitNumber: dto.unitNumber }),
      });

      if (existingUnit) {
        throw new BadRequestException(
          'Unit number already exists in this building',
        );
      }
    }

    const updatedUnit = await this.prisma.unit.update({
      where: { id },
      data: {
        unitNumber: dto.unitNumber,
        floor: dto.floor,
        size: dto.size,
        type: dto.type,
        rentPrice: dto.rentPrice,
        status: dto.status,
      },
      include: {
        building: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const userName = await this.getUserName(userId, userRole);

    await this.activityLogsService.create({
      action: 'update',
      entityType: 'unit',
      entityId: updatedUnit.id,
      userId,
      userName,
      userRole,
      buildingId,
      details: { changes: { ...dto } } as Prisma.InputJsonValue,
    });

    return updatedUnit;
  }

  async remove(
    buildingId: string,
    id: string,
    userId: string,
    userRole: string,
  ) {
    const unit = await this.prisma.unit.findFirst({
      where: whereActive({ id }),
    });

    if (!unit) {
      throw new NotFoundException('Unit not found');
    }

    if (unit.buildingId !== buildingId) {
      throw new NotFoundException('Unit not found in this building');
    }

    const activeLeaseCount = await this.prisma.lease.count({
      where: {
        unitId: id,
        status: 'active' as const,
        deletedAt: null,
      },
    });
    if (activeLeaseCount > 0) {
      throw new ConflictException(
        'Cannot delete unit: it has an active lease. End or terminate the lease first.',
      );
    }

    await this.softDeleteService.softDeleteUnit(id, userId);

    const userName = await this.getUserName(userId, userRole);

    await this.activityLogsService.create({
      action: 'delete',
      entityType: 'unit',
      entityId: id,
      userId,
      userName,
      userRole,
      buildingId,
      details: { unitNumber: unit.unitNumber },
    });

    return { message: 'Unit deleted successfully' };
  }

  // Helper function
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
