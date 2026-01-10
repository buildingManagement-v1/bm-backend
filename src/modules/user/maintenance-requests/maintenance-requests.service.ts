import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from 'generated/prisma/client';
import {
  CreateMaintenanceRequestDto,
  UpdateMaintenanceRequestDto,
} from './dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';

@Injectable()
export class MaintenanceRequestsService {
  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
  ) {}

  async create(
    buildingId: string,
    userId: string,
    userRole: string,
    dto: CreateMaintenanceRequestDto,
  ) {
    let tenantId: string;
    let unitId: string | undefined;

    // Managers and Owners must select a tenant
    if (userRole === 'owner' || userRole === 'manager') {
      if (!dto.tenantId) {
        throw new BadRequestException('Please select a tenant');
      }

      const tenant = await this.prisma.tenant.findFirst({
        where: { id: dto.tenantId, buildingId },
      });

      if (!tenant) {
        throw new NotFoundException('Tenant not found in this building');
      }

      tenantId = dto.tenantId;
      unitId = tenant.unitId || undefined;
    } else {
      console.log('===============');
      console.log(userRole);
      // User IS a tenant - use their ID
      const tenant = await this.prisma.tenant.findFirst({
        where: { id: userId, buildingId },
      });

      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }

      tenantId = userId;
      unitId = tenant.unitId || undefined;
    }

    const request = await this.prisma.maintenanceRequest.create({
      data: {
        buildingId,
        tenantId,
        title: dto.title,
        description: dto.description,
        unitId,
        priority: dto.priority || 'medium',
        notes: [],
      },
      include: {
        tenant: { select: { id: true, name: true, email: true } },
        unit: { select: { id: true, unitNumber: true, floor: true } },
      },
    });

    const userName = await this.getUserName(userId, userRole);
    await this.activityLogsService.create({
      action: 'create',
      entityType: 'maintenance_request',
      entityId: request.id,
      userId,
      userName,
      userRole,
      buildingId,
      details: {
        title: request.title,
        priority: request.priority,
        tenantId: request.tenantId,
      } as Prisma.InputJsonValue,
    });

    return request;

    return request;
  }

  async findAll(buildingId: string, userId: string, userRole?: string) {
    const whereClause: Prisma.MaintenanceRequestWhereInput = {
      buildingId,
      ...(userRole !== 'manager' &&
        userRole !== 'owner' && { tenantId: userId }),
    };

    const requests = await this.prisma.maintenanceRequest.findMany({
      where: whereClause,
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
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

    return requests;
  }

  async findOne(
    id: string,
    buildingId: string,
    userId: string,
    userRole?: string,
  ) {
    const request = await this.prisma.maintenanceRequest.findFirst({
      where: { id, buildingId },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        unit: {
          select: {
            id: true,
            unitNumber: true,
            floor: true,
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Maintenance request not found');
    }

    // Tenants can only view their own requests
    if (
      userRole !== 'manager' &&
      userRole !== 'owner' &&
      request.tenantId !== userId
    ) {
      throw new ForbiddenException('You can only view your own requests');
    }

    return request;
  }

  async update(
    id: string,
    buildingId: string,
    userId: string,
    userRole: string,
    dto: UpdateMaintenanceRequestDto,
  ) {
    const request = await this.prisma.maintenanceRequest.findFirst({
      where: { id, buildingId },
    });

    if (!request) {
      throw new NotFoundException('Maintenance request not found');
    }

    const userName = await this.getUserName(userId, userRole);
    const dataToUpdate: Prisma.MaintenanceRequestUpdateInput = {};

    if (dto.status) {
      dataToUpdate.status = dto.status;
      if (dto.status === 'completed') {
        dataToUpdate.completedAt = new Date();
      } else if (request.completedAt) {
        dataToUpdate.completedAt = null;
      }
    }

    if (dto.note) {
      const existingNotes = (request.notes || []) as Array<{
        text: string;
        author: string;
        timestamp: string;
      }>;
      const newNote = {
        text: dto.note,
        author: userName,
        timestamp: new Date().toISOString(),
      };
      dataToUpdate.notes = existingNotes.concat(
        newNote,
      ) as Prisma.InputJsonValue;
    }

    const updated = await this.prisma.maintenanceRequest.update({
      where: { id },
      data: dataToUpdate,
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        unit: {
          select: {
            id: true,
            unitNumber: true,
            floor: true,
          },
        },
      },
    });

    if (dto.status) {
      await this.activityLogsService.create({
        action: 'status_change',
        entityType: 'maintenance_request',
        entityId: updated.id,
        userId,
        userName,
        userRole,
        buildingId,
        details: { status: dto.status } as Prisma.InputJsonValue,
      });
    }

    return updated;
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
}
