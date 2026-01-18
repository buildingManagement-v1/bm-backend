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
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { Prisma } from 'generated/prisma/browser';
import { EmailService } from 'src/common/email/email.service';
import { PlanLimitsService } from 'src/common/plan-limits/plan-limits.service';

@Injectable()
export class ManagersService {
  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
    private emailService: EmailService,
    private planLimitsService: PlanLimitsService,
  ) {}

  async create(userId: string, dto: CreateManagerDto) {
    await this.planLimitsService.canCreateManager(userId);

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

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    const userName = user?.name || 'Unknown';

    for (const assignment of dto.buildingAssignments) {
      await this.activityLogsService.create({
        action: 'create',
        entityType: 'manager',
        entityId: manager.id,
        userId,
        userName,
        userRole: 'owner',
        buildingId: assignment.buildingId,
        details: {
          managerName: manager.name,
          managerEmail: manager.email,
          roles: assignment.roles,
        } as Prisma.InputJsonValue,
      });
    }

    await this.emailService.sendManagerCreatedEmail(
      manager.email,
      manager.name,
      dto.password,
    );

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

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    const userName = user?.name || 'Unknown';

    const currentAssignments = await this.prisma.managerBuildingRole.findMany({
      where: { managerId },
      select: { buildingId: true },
    });

    for (const assignment of currentAssignments) {
      await this.activityLogsService.create({
        action: 'update',
        entityType: 'manager',
        entityId: managerId,
        userId,
        userName,
        userRole: 'owner',
        buildingId: assignment.buildingId,
        details: {
          changes: {
            name: dto.name,
            email: dto.email,
            phone: dto.phone,
            status: dto.status,
          },
        } as Prisma.InputJsonValue,
      });
    }

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

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    const userName = user?.name || 'Unknown';

    const assignments = await this.prisma.managerBuildingRole.findMany({
      where: { managerId },
      select: { buildingId: true },
    });

    for (const assignment of assignments) {
      await this.activityLogsService.create({
        action: 'delete',
        entityType: 'manager',
        entityId: managerId,
        userId,
        userName,
        userRole: 'owner',
        buildingId: assignment.buildingId,
        details: {
          managerName: manager.name,
          managerEmail: manager.email,
        } as Prisma.InputJsonValue,
      });
    }

    await this.prisma.manager.delete({
      where: { id: managerId },
    });

    return { message: 'Manager deleted successfully' };
  }
}
