import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateNotificationDto, QueryNotificationsDto } from './dto';
import { UserType } from 'generated/prisma/client';

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
    const { page = 1, limit = 20, isRead } = query;
    const skip = (page - 1) * limit;

    const where = {
      userId,
      userType,
      ...(isRead !== undefined && { isRead }),
    };

    const [data, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
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
