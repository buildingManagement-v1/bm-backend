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
import { EmailService } from 'src/common/email/email.service';
import { NotificationsService } from 'src/common/notifications/notifications.service';
import { buildPageInfo } from 'src/common/pagination';
import { SoftDeleteService } from 'src/common/soft-delete/soft-delete.service';
import { whereActive } from 'src/common/soft-delete/soft-delete.scope';

@Injectable()
export class MaintenanceRequestsService {
  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
    private emailService: EmailService,
    private notificationsService: NotificationsService,
    private softDeleteService: SoftDeleteService,
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
        where: whereActive({ id: dto.tenantId, buildingId }),
      });

      if (!tenant) {
        throw new NotFoundException('Tenant not found in this building');
      }

      const activeLease = await this.prisma.lease.findFirst({
        where: whereActive({
          tenantId: dto.tenantId,
          status: 'active' as const,
        }),
        select: { unitId: true },
      });

      tenantId = dto.tenantId;
      unitId = activeLease?.unitId || undefined;
    } else {
      const tenant = await this.prisma.tenant.findFirst({
        where: whereActive({ id: userId, buildingId }),
      });

      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }

      const activeLease = await this.prisma.lease.findFirst({
        where: whereActive({ tenantId: userId, status: 'active' as const }),
        select: { unitId: true },
      });

      tenantId = userId;
      unitId = activeLease?.unitId || undefined;
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

    const tenantData = await this.prisma.tenant.findFirst({
      where: whereActive({ id: tenantId }),
      select: { name: true, buildingId: true },
    });

    if (!tenantData) {
      return {
        success: true,
        data: request,
        message: 'Maintenance request submitted successfully',
      };
    }

    const building = await this.prisma.building.findFirst({
      where: whereActive({ id: tenantData.buildingId }),
      select: { userId: true },
    });

    if (building) {
      const owner = await this.prisma.user.findUnique({
        where: { id: building.userId },
        select: { name: true, email: true },
      });

      if (owner) {
        await this.emailService.sendMaintenanceRequestCreatedEmail(
          owner.email,
          owner.name,
          tenantData.name,
          request.unit?.unitNumber || 'N/A',
          request.title,
          request.priority,
        );

        await this.notificationsService.create({
          userId: building.userId,
          userType: 'user',
          type: 'maintenance_request_created',
          title: 'New Maintenance Request',
          message: `${tenantData.name} submitted a maintenance request: ${request.title}`,
          link: `/dashboard/maintenance?building=${tenantData.buildingId}`,
        });
      }
    }

    return request;
  }

  async findAll(
    buildingId: string,
    userId: string,
    userRole?: string,
    limit = 20,
    offset = 0,
    filters?: { status?: string; priority?: string; q?: string },
  ) {
    const whereClause: Prisma.MaintenanceRequestWhereInput = whereActive({
      buildingId,
      ...(userRole !== 'manager' &&
        userRole !== 'owner' && { tenantId: userId }),
    });
    if (
      filters?.status &&
      ['pending', 'in_progress', 'completed', 'cancelled'].includes(
        filters.status,
      )
    ) {
      whereClause.status = filters.status as
        | 'pending'
        | 'in_progress'
        | 'completed'
        | 'cancelled';
    }
    if (
      filters?.priority &&
      ['low', 'medium', 'high', 'urgent'].includes(filters.priority)
    ) {
      whereClause.priority = filters.priority as
        | 'low'
        | 'medium'
        | 'high'
        | 'urgent';
    }
    if (filters?.q?.trim()) {
      whereClause.tenant = {
        name: { contains: filters.q.trim(), mode: 'insensitive' },
      };
    }

    const [totalCount, data] = await Promise.all([
      this.prisma.maintenanceRequest.count({ where: whereClause }),
      this.prisma.maintenanceRequest.findMany({
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
        take: limit,
        skip: offset,
      }),
    ]);
    const page_info = buildPageInfo(limit, offset, totalCount);
    return { data, meta: { page_info } };
  }

  async findOne(
    id: string,
    buildingId: string,
    userId: string,
    userRole?: string,
  ) {
    const request = await this.prisma.maintenanceRequest.findFirst({
      where: whereActive({ id, buildingId }),
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
      where: whereActive({ id, buildingId }),
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

    if (
      dto.status &&
      (dto.status === 'in_progress' || dto.status === 'completed')
    ) {
      await this.emailService.sendMaintenanceStatusUpdateEmail(
        updated.tenant.email,
        updated.tenant.name,
        updated.title,
        dto.status,
      );

      await this.notificationsService.create({
        userId: updated.tenantId,
        userType: 'tenant',
        type: 'maintenance_request_updated',
        title: 'Maintenance Request Updated',
        message: `Your maintenance request "${updated.title}" is now ${dto.status.replace('_', ' ')}`,
        link: `/tenant/maintenance`,
      });
    }

    return updated;
  }

  async remove(
    id: string,
    buildingId: string,
    userId: string,
    userRole: string,
  ) {
    const request = await this.prisma.maintenanceRequest.findFirst({
      where: whereActive({ id, buildingId }),
      include: {
        tenant: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Maintenance request not found');
    }

    await this.softDeleteService.softDeleteMaintenanceRequest(id, userId);

    const userName = await this.getUserName(userId, userRole);
    await this.activityLogsService.create({
      action: 'delete',
      entityType: 'maintenance_request',
      entityId: id,
      userId,
      userName,
      userRole,
      buildingId,
      details: {
        title: request.title,
        tenantId: request.tenantId,
      } as Prisma.InputJsonValue,
    });

    await this.emailService.sendMaintenanceStatusUpdateEmail(
      request.tenant.email,
      request.tenant.name,
      request.title,
      'cancelled',
    );

    await this.notificationsService.create({
      userId: request.tenantId,
      userType: 'tenant',
      type: 'maintenance_request_updated',
      title: 'Maintenance Request Cancelled',
      message: `Your maintenance request "${request.title}" has been cancelled`,
      link: `/tenant/maintenance`,
    });

    return { success: true };
  }

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
