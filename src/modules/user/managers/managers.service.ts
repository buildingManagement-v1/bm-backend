import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateManagerDto, UpdateManagerDto } from './dto';
import * as bcrypt from 'bcrypt';
import { UserStatus } from 'generated/prisma/enums';

@Injectable()
export class ManagersService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateManagerDto) {
    // Check if email already exists
    const existing = await this.prisma.manager.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email already exists');
    }

    // Verify all buildings belong to this user
    const buildings = await this.prisma.building.findMany({
      where: {
        id: { in: dto.buildingAssignments.map((a) => a.buildingId) },
        userId,
      },
    });

    if (buildings.length !== dto.buildingAssignments.length) {
      throw new ForbiddenException(
        'One or more buildings do not belong to you',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Create manager with building assignments
    const manager = await this.prisma.manager.create({
      data: {
        userId,
        name: dto.name,
        email: dto.email,
        passwordHash: hashedPassword,
        phone: dto.phone,
        buildingRoles: {
          create: dto.buildingAssignments.map((assignment) => ({
            buildingId: assignment.buildingId,
            roles: assignment.roles,
          })),
        },
      },
      include: {
        buildingRoles: {
          include: {
            building: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return {
      id: manager.id,
      name: manager.name,
      email: manager.email,
      phone: manager.phone,
      status: manager.status,
      buildingAssignments: manager.buildingRoles.map((br) => ({
        buildingId: br.buildingId,
        buildingName: br.building.name,
        roles: br.roles,
      })),
    };
  }

  async findAll(userId: string) {
    const managers = await this.prisma.manager.findMany({
      where: { userId },
      include: {
        buildingRoles: {
          include: {
            building: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return managers.map((manager) => ({
      id: manager.id,
      name: manager.name,
      email: manager.email,
      phone: manager.phone,
      status: manager.status,
      lastLoginAt: manager.lastLoginAt,
      buildingCount: manager.buildingRoles.length,
      buildings: manager.buildingRoles.map((br) => ({
        buildingId: br.buildingId,
        buildingName: br.building.name,
        roles: br.roles,
      })),
    }));
  }

  async findOne(userId: string, managerId: string) {
    const manager = await this.prisma.manager.findFirst({
      where: {
        id: managerId,
        userId,
      },
      include: {
        buildingRoles: {
          include: {
            building: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!manager) {
      throw new NotFoundException('Manager not found');
    }

    return {
      id: manager.id,
      name: manager.name,
      email: manager.email,
      phone: manager.phone,
      status: manager.status,
      lastLoginAt: manager.lastLoginAt,
      mustResetPassword: manager.mustResetPassword,
      createdAt: manager.createdAt,
      buildings: manager.buildingRoles.map((br) => ({
        buildingId: br.buildingId,
        buildingName: br.building.name,
        roles: br.roles,
      })),
    };
  }

  async update(userId: string, managerId: string, dto: UpdateManagerDto) {
    const manager = await this.prisma.manager.findFirst({
      where: {
        id: managerId,
        userId,
      },
    });

    if (!manager) {
      throw new NotFoundException('Manager not found');
    }

    if (dto.email && dto.email !== manager.email) {
      const existing = await this.prisma.manager.findUnique({
        where: { email: dto.email },
      });

      if (existing) {
        throw new ConflictException('Email already exists');
      }
    }

    // If updating building assignments, verify buildings belong to user
    if (dto.buildingAssignments) {
      const buildings = await this.prisma.building.findMany({
        where: {
          id: { in: dto.buildingAssignments.map((a) => a.buildingId) },
          userId,
        },
      });

      if (buildings.length !== dto.buildingAssignments.length) {
        throw new ForbiddenException(
          'One or more buildings do not belong to you',
        );
      }
    }

    const updateData: {
      name?: string;
      email?: string;
      passwordHash?: string;
      phone?: string;
      status?: UserStatus;
    } = {};

    if (dto.name) updateData.name = dto.name;
    if (dto.email) updateData.email = dto.email;
    if (dto.phone) updateData.phone = dto.phone;
    if (dto.status) updateData.status = dto.status;

    if (dto.password) {
      updateData.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    // Update manager basic info
    await this.prisma.manager.update({
      where: { id: managerId },
      data: updateData,
    });

    // Update building assignments if provided
    if (dto.buildingAssignments) {
      // Delete existing building roles
      await this.prisma.managerBuildingRole.deleteMany({
        where: { managerId },
      });

      // Create new building roles
      await this.prisma.managerBuildingRole.createMany({
        data: dto.buildingAssignments.map((assignment) => ({
          managerId,
          buildingId: assignment.buildingId,
          roles: assignment.roles,
        })),
      });
    }

    // Return updated manager with building assignments
    const managerWithRoles = await this.prisma.manager.findUnique({
      where: { id: managerId },
      include: {
        buildingRoles: {
          include: {
            building: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return {
      id: managerWithRoles!.id,
      name: managerWithRoles!.name,
      email: managerWithRoles!.email,
      phone: managerWithRoles!.phone,
      status: managerWithRoles!.status,
      buildings: managerWithRoles!.buildingRoles.map((br) => ({
        buildingId: br.buildingId,
        buildingName: br.building.name,
        roles: br.roles,
      })),
    };
  }

  async remove(userId: string, managerId: string) {
    const manager = await this.prisma.manager.findFirst({
      where: {
        id: managerId,
        userId,
      },
    });

    if (!manager) {
      throw new NotFoundException('Manager not found');
    }

    await this.prisma.manager.delete({
      where: { id: managerId },
    });

    return { message: 'Manager deleted successfully' };
  }
}
