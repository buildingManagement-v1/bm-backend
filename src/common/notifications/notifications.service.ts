import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNotificationDto, QueryNotificationsDto } from './dto';
import { UserType } from 'generated/prisma/client';
import { buildPageInfo } from '../pagination';
import { ActivityLogsService } from '../../modules/user/activity-logs/activity-logs.service';
import { Prisma } from 'generated/prisma/client';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
  ) {}

  private async getBuildingIdAndActor(
    userId: string,
    userType: UserType,
  ): Promise<{
    buildingId: string;
    userName: string;
    userRole: string;
  } | null> {
    if (userType === 'user') {
      const building = await this.prisma.building.findFirst({
        where: { userId },
        select: { id: true },
      });
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      if (building && user)
        return {
          buildingId: building.id,
          userName: user.name ?? 'Unknown',
          userRole: 'owner',
        };
    } else if (userType === 'manager') {
      const assignment = await this.prisma.managerBuildingRole.findFirst({
        where: { managerId: userId },
        select: { buildingId: true },
      });
      const manager = await this.prisma.manager.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      if (assignment && manager)
        return {
          buildingId: assignment.buildingId,
          userName: manager.name ?? 'Unknown',
          userRole: 'manager',
        };
    } else if (userType === 'tenant') {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: userId },
        select: { buildingId: true, name: true },
      });
      if (tenant)
        return {
          buildingId: tenant.buildingId,
          userName: tenant.name,
          userRole: 'tenant',
        };
    }
    return null;
  }

  async create(dto: CreateNotificationDto) {
    return await this.prisma.notification.create({
      data: dto,
    });
  }

  async findAll(
    userId: string,
    userType: UserType,
    query: QueryNotificationsDto,
  ) {
    const { limit = 20, offset = 0, isRead } = query;

    const where = {
      userId,
      userType,
      ...(isRead !== undefined && { isRead }),
    };

    const [totalCount, data] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
    ]);

    const page_info = buildPageInfo(limit, offset, totalCount);
    return { data, meta: { page_info } };
  }

  async getUnreadCount(userId: string, userType: UserType) {
    return await this.prisma.notification.count({
      where: { userId, userType, isRead: false },
    });
  }

  async markAsRead(id: string, userId: string, userType: UserType) {
    return await this.prisma.notification.updateMany({
      where: { id, userId, userType },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string, userType: UserType) {
    return await this.prisma.notification.updateMany({
      where: { userId, userType, isRead: false },
      data: { isRead: true },
    });
  }

  async delete(id: string, userId: string, userType: UserType) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId, userType },
      select: { id: true, title: true, type: true },
    });
    const result = await this.prisma.notification.deleteMany({
      where: { id, userId, userType },
    });
    if (result.count > 0 && notification) {
      const actor = await this.getBuildingIdAndActor(userId, userType);
      if (actor) {
        await this.activityLogsService.create({
          action: 'delete',
          entityType: 'notification',
          entityId: id,
          userId,
          userName: actor.userName,
          userRole: actor.userRole,
          buildingId: actor.buildingId,
          details: {
            title: notification.title,
            type: notification.type,
          } as Prisma.InputJsonValue,
        });
      }
    }
    return result;
  }
}
