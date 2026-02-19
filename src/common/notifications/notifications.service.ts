import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNotificationDto, QueryNotificationsDto } from './dto';
import { UserType } from 'generated/prisma/client';
import { buildPageInfo } from '../pagination';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

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
    return await this.prisma.notification.deleteMany({
      where: { id, userId, userType },
    });
  }
}
