import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateBuildingDto, UpdateBuildingDto } from './dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { PlanLimitsService } from 'src/common/plan-limits/plan-limits.service';

@Injectable()
export class BuildingsService {
  constructor(
    private prisma: PrismaService,
    private planLimitsService: PlanLimitsService,
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
          where: { managerId: userId },
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

      return managerAssignments.map((assignment) => assignment.building);
    }

    // If owner, return their buildings
    const buildings = await this.prisma.building.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return buildings;
  }

  async findOne(userId: string, buildingId: string, userRole: string) {
    const building = await this.prisma.building.findUnique({
      where: { id: buildingId },
    });

    if (!building) {
      throw new NotFoundException('Building not found');
    }

    // If manager, check if they have access to this building
    if (userRole === 'manager') {
      const hasAccess = await this.prisma.managerBuildingRole.findUnique({
        where: {
          managerId_buildingId: {
            managerId: userId,
            buildingId,
          },
        },
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
      where: {
        id: buildingId,
        userId,
      },
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
      where: {
        id: buildingId,
        userId,
      },
    });

    if (!building) {
      throw new NotFoundException('Building not found');
    }

    await this.prisma.building.delete({
      where: { id: buildingId },
    });

    return { message: 'Building deleted successfully' };
  }
}
