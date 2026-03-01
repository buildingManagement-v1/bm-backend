import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateBuildingDto, UpdateBuildingDto } from './dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { PlanLimitsService } from 'src/common/plan-limits/plan-limits.service';
import { SoftDeleteService } from 'src/common/soft-delete/soft-delete.service';
import { whereActive } from 'src/common/soft-delete/soft-delete.scope';

@Injectable()
export class BuildingsService {
  constructor(
    private prisma: PrismaService,
    private planLimitsService: PlanLimitsService,
    private softDeleteService: SoftDeleteService,
  ) {}

  async create(userId: string, dto: CreateBuildingDto) {
    await this.planLimitsService.canCreateBuilding(userId);

    const building = await this.prisma.building.create({
      data: {
        userId,
        name: dto.name,
        address: dto.address,
        city: dto.city,
        country: dto.country,
        contactEmail: dto.contactEmail,
        contactPhone: dto.contactPhone,
        logoUrl: dto.logoUrl,
        settings: dto.settings,
      },
    });

    return building;
  }

  async findAll(userId: string, userRole: string) {
    // If manager, return only buildings they're assigned to
    if (userRole === 'manager') {
      const managerAssignments = await this.prisma.managerBuildingRole.findMany(
        {
          where: whereActive({ managerId: userId }),
          include: {
            building: true,
          },
          orderBy: {
            building: {
              createdAt: 'desc',
            },
          },
        },
      );

      return managerAssignments
        .filter((a) => a.building && !a.building.deletedAt)
        .map((assignment) => assignment.building);
    }

    // If owner, return their buildings
    const buildings = await this.prisma.building.findMany({
      where: whereActive({ userId }),
      orderBy: { createdAt: 'desc' },
    });

    return buildings;
  }

  /** Lightweight list for dropdowns: id and name only, active buildings */
  async findOptions(userId: string, userRole: string) {
    if (userRole === 'manager') {
      const assignments = await this.prisma.managerBuildingRole.findMany({
        where: whereActive({ managerId: userId }),
        include: {
          building: {
            select: { id: true, name: true, status: true, deletedAt: true },
          },
        },
        orderBy: { building: { createdAt: 'desc' } },
      });
      return assignments
        .filter(
          (a): a is typeof a & { building: NonNullable<typeof a.building> } =>
            a.building != null &&
            a.building.status === 'active' &&
            !a.building.deletedAt,
        )
        .map((a) => ({ id: a.building.id, name: a.building.name }));
    }
    const buildings = await this.prisma.building.findMany({
      where: whereActive({ userId, status: 'active' as const }),
      select: { id: true, name: true },
      orderBy: { createdAt: 'desc' },
    });
    return buildings;
  }

  async findOne(userId: string, buildingId: string, userRole: string) {
    const building = await this.prisma.building.findFirst({
      where: whereActive({ id: buildingId }),
    });

    if (!building) {
      throw new NotFoundException('Building not found');
    }

    // If manager, check if they have access to this building
    if (userRole === 'manager') {
      const hasAccess = await this.prisma.managerBuildingRole.findFirst({
        where: whereActive({ managerId: userId, buildingId }),
      });

      if (!hasAccess) {
        throw new ForbiddenException('You do not have access to this building');
      }

      return building;
    }

    // If owner, check ownership
    if (building.userId !== userId) {
      throw new ForbiddenException('You do not have access to this building');
    }

    return building;
  }

  async update(userId: string, buildingId: string, dto: UpdateBuildingDto) {
    const building = await this.prisma.building.findFirst({
      where: whereActive({ id: buildingId, userId }),
    });

    if (!building) {
      throw new NotFoundException('Building not found');
    }

    const updated = await this.prisma.building.update({
      where: { id: buildingId },
      data: dto,
    });

    return updated;
  }

  async remove(userId: string, buildingId: string) {
    const building = await this.prisma.building.findFirst({
      where: whereActive({ id: buildingId, userId }),
    });

    if (!building) {
      throw new NotFoundException('Building not found');
    }

    await this.softDeleteService.softDeleteBuilding(buildingId, userId);

    return { message: 'Building deleted successfully' };
  }
}
