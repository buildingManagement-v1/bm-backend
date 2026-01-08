import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateUnitDto, UpdateUnitDto } from './dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { Prisma } from 'generated/prisma/browser';

@Injectable()
export class UnitsService {
  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
  ) {}

  async create(
    buildingId: string,
    dto: CreateUnitDto,
    userId: string,
    userRole: string,
  ) {
    const existingUnit = await this.prisma.unit.findUnique({
      where: {
        buildingId_unitNumber: {
          buildingId,
          unitNumber: dto.unitNumber,
        },
      },
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

  async findAll(buildingId: string) {
    const units = await this.prisma.unit.findMany({
      where: { buildingId },
      include: {
        building: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return units;
  }

  async findOne(buildingId: string, id: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id },
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
    const unit = await this.prisma.unit.findUnique({
      where: { id },
    });

    if (!unit) {
      throw new NotFoundException('Unit not found');
    }

    if (unit.buildingId !== buildingId) {
      throw new NotFoundException('Unit not found in this building');
    }

    if (dto.unitNumber && dto.unitNumber !== unit.unitNumber) {
      const existingUnit = await this.prisma.unit.findUnique({
        where: {
          buildingId_unitNumber: {
            buildingId,
            unitNumber: dto.unitNumber,
          },
        },
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
    const unit = await this.prisma.unit.findUnique({
      where: { id },
    });

    if (!unit) {
      throw new NotFoundException('Unit not found');
    }

    if (unit.buildingId !== buildingId) {
      throw new NotFoundException('Unit not found in this building');
    }

    await this.prisma.unit.delete({
      where: { id },
    });

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
}
