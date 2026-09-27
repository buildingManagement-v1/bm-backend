import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ActivityAction,
  ActivityEntityType,
  Prisma,
} from 'generated/prisma/client';
import { buildPageInfo } from 'src/common/pagination';

interface CreateActivityLogDto {
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: string;
  userId: string;
  userName: string;
  userRole: string;
  buildingId: string;
  details?: Prisma.InputJsonValue;
}

interface CreatePlatformActivityLogDto {
  action: ActivityAction;
  entityType: ActivityEntityType;
  entityId: string;
  adminId: string;
  adminName: string;
  details?: Prisma.InputJsonValue;
}

interface FindAllFilters {
  startDate?: string;
  endDate?: string;
  entityType?: ActivityEntityType;
  action?: ActivityAction;
}

@Injectable()
export class ActivityLogsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateActivityLogDto) {
    return await this.prisma.activityLog.create({
      data: {
        action: dto.action,
        entityType: dto.entityType,
        entityId: dto.entityId,
        userId: dto.userId,
        userName: dto.userName,
        userRole: dto.userRole,
        buildingId: dto.buildingId,
        details: dto.details || {},
      },
    });
  }

  async createPlatformLog(dto: CreatePlatformActivityLogDto) {
    return await this.prisma.platformActivityLog.create({
      data: {
        action: dto.action,
        entityType: dto.entityType,
        entityId: dto.entityId,
        adminId: dto.adminId,
        adminName: dto.adminName,
        details: dto.details || {},
      },
    });
  }

  async findAll(
    buildingId: string,
    filters?: FindAllFilters,
    limit = 20,
    offset = 0,
  ) {
    const where: {
      buildingId: string;
      createdAt?: { gte?: Date; lte?: Date };
      entityType?: ActivityEntityType;
      action?: ActivityAction;
    } = { buildingId };

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    if (filters?.entityType) where.entityType = filters.entityType;
    if (filters?.action) where.action = filters.action;

    const [totalCount, data] = await Promise.all([
      this.prisma.activityLog.count({ where }),
      this.prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);
    const page_info = buildPageInfo(limit, offset, totalCount);
    return { data, meta: { page_info } };
  }

  async findAllPlatform(
    filters: FindAllFilters & { adminId?: string; q?: string },
    limit = 50,
    offset = 0,
  ) {
    const where: Prisma.PlatformActivityLogWhereInput = {};

    if (filters.startDate || filters.endDate) {
      where.createdAt = {
        ...(filters.startDate && { gte: new Date(filters.startDate) }),
        // The end date includes that whole day
        ...(filters.endDate && {
          lte: new Date(new Date(filters.endDate).getTime() + 86_400_000 - 1),
        }),
      };
    }
    if (
      filters.entityType &&
      Object.values(ActivityEntityType).includes(filters.entityType)
    ) {
      where.entityType = filters.entityType;
    }
    if (
      filters.action &&
      Object.values(ActivityAction).includes(filters.action)
    ) {
      where.action = filters.action;
    }
    if (filters.adminId) where.adminId = filters.adminId;
    if (filters.q?.trim()) {
      where.OR = [
        { adminName: { contains: filters.q.trim(), mode: 'insensitive' } },
        { entityId: { contains: filters.q.trim() } },
      ];
    }

    const [totalCount, data] = await Promise.all([
      this.prisma.platformActivityLog.count({ where }),
      this.prisma.platformActivityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);
    return {
      data,
      meta: { page_info: buildPageInfo(limit, offset, totalCount) },
    };
  }
}
