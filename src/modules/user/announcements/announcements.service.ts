import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { NotificationsService } from 'src/common/notifications/notifications.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { buildPageInfo } from 'src/common/pagination';
import { toUtcDate, todayDate } from 'src/common/lease/lease-cycles.util';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto';

const announcementSelect = {
  id: true,
  buildingId: true,
  title: true,
  content: true,
  priority: true,
  publishedAt: true,
  expiresAt: true,
  createdByName: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AnnouncementSelect;

/** Visible to tenants: published, not deleted, not past its expiry date. */
export function liveAnnouncementWhere(
  buildingId: string,
): Prisma.AnnouncementWhereInput {
  return {
    buildingId,
    deletedAt: null,
    publishedAt: { not: null, lte: new Date() },
    OR: [{ expiresAt: null }, { expiresAt: { gte: todayDate() } }],
  };
}

@Injectable()
export class AnnouncementsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private activityLogsService: ActivityLogsService,
  ) {}

  async create(
    buildingId: string,
    dto: CreateAnnouncementDto,
    actor: { id: string; role: string },
  ) {
    const expiresAt = this.parseExpiry(dto.expiresAt);
    const actorName = await this.actorName(actor);
    const publish = dto.publish ?? true;

    const announcement = await this.prisma.announcement.create({
      data: {
        buildingId,
        title: dto.title.trim(),
        content: dto.content.trim(),
        priority: dto.priority ?? 'normal',
        expiresAt,
        publishedAt: publish ? new Date() : null,
        createdById: actor.id,
        createdByName: actorName,
      },
      select: announcementSelect,
    });

    await this.log('create', announcement.id, buildingId, actor, actorName, {
      title: announcement.title,
      published: publish,
    });
    if (publish) await this.notifyTenants(announcement);

    return announcement;
  }

  async findAll(
    buildingId: string,
    opts: { limit: number; offset: number; q?: string },
  ) {
    const where: Prisma.AnnouncementWhereInput = {
      buildingId,
      deletedAt: null,
    };
    if (opts.q?.trim()) {
      where.OR = [
        { title: { contains: opts.q.trim(), mode: 'insensitive' } },
        { content: { contains: opts.q.trim(), mode: 'insensitive' } },
      ];
    }
    const [totalCount, items] = await Promise.all([
      this.prisma.announcement.count({ where }),
      this.prisma.announcement.findMany({
        where,
        select: announcementSelect,
        orderBy: [
          { publishedAt: { sort: 'desc', nulls: 'first' } },
          { createdAt: 'desc' },
        ],
        take: opts.limit,
        skip: opts.offset,
      }),
    ]);
    return {
      items,
      pageInfo: buildPageInfo(opts.limit, opts.offset, totalCount),
    };
  }

  async findOne(buildingId: string, id: string) {
    const announcement = await this.prisma.announcement.findFirst({
      where: { id, buildingId, deletedAt: null },
      select: announcementSelect,
    });
    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }
    return announcement;
  }

  async update(
    buildingId: string,
    id: string,
    dto: UpdateAnnouncementDto,
    actor: { id: string; role: string },
  ) {
    await this.findOne(buildingId, id);
    const updated = await this.prisma.announcement.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        content: dto.content?.trim(),
        priority: dto.priority,
        ...(dto.expiresAt !== undefined && {
          expiresAt: this.parseExpiry(dto.expiresAt),
        }),
      },
      select: announcementSelect,
    });
    await this.log(
      'update',
      id,
      buildingId,
      actor,
      await this.actorName(actor),
      { changes: { ...dto } },
    );
    return updated;
  }

  async publish(
    buildingId: string,
    id: string,
    actor: { id: string; role: string },
  ) {
    const existing = await this.findOne(buildingId, id);
    if (existing.publishedAt) {
      throw new ConflictException('Announcement is already published');
    }
    const announcement = await this.prisma.announcement.update({
      where: { id },
      data: { publishedAt: new Date() },
      select: announcementSelect,
    });
    await this.log(
      'status_change',
      id,
      buildingId,
      actor,
      await this.actorName(actor),
      { published: true },
    );
    await this.notifyTenants(announcement);
    return announcement;
  }

  async remove(
    buildingId: string,
    id: string,
    actor: { id: string; role: string },
  ) {
    const existing = await this.findOne(buildingId, id);
    await this.prisma.announcement.update({
      where: { id },
      data: { deletedAt: new Date(), deletedById: actor.id },
    });
    await this.log(
      'delete',
      id,
      buildingId,
      actor,
      await this.actorName(actor),
      { title: existing.title },
    );
    return { message: 'Announcement deleted' };
  }

  // ─── Tenant portal ──────────────────────────────────────────────────────

  async listForTenant(
    tenantId: string,
    opts: { limit: number; offset: number },
  ) {
    const buildingId = await this.tenantBuilding(tenantId);
    const where = liveAnnouncementWhere(buildingId);
    const [totalCount, items] = await Promise.all([
      this.prisma.announcement.count({ where }),
      this.prisma.announcement.findMany({
        where,
        select: announcementSelect,
        orderBy: { publishedAt: 'desc' },
        take: opts.limit,
        skip: opts.offset,
      }),
    ]);
    return {
      items,
      pageInfo: buildPageInfo(opts.limit, opts.offset, totalCount),
    };
  }

  async findOneForTenant(tenantId: string, id: string) {
    const buildingId = await this.tenantBuilding(tenantId);
    const announcement = await this.prisma.announcement.findFirst({
      where: { id, ...liveAnnouncementWhere(buildingId) },
      select: announcementSelect,
    });
    if (!announcement) {
      throw new NotFoundException('Announcement not found');
    }
    return announcement;
  }

  private async tenantBuilding(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { buildingId: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant.buildingId;
  }

  /** Tells every tenant currently living in the building. */
  private async notifyTenants(announcement: {
    id: string;
    buildingId: string;
    title: string;
    priority: string;
  }) {
    const tenants = await this.prisma.tenant.findMany({
      where: {
        buildingId: announcement.buildingId,
        deletedAt: null,
        leases: { some: { status: 'active', deletedAt: null } },
      },
      select: { id: true },
    });
    for (const tenant of tenants) {
      await this.notificationsService.create({
        userId: tenant.id,
        userType: 'tenant',
        type: 'announcement',
        title:
          announcement.priority === 'urgent'
            ? `Urgent: ${announcement.title}`
            : announcement.title,
        message: 'New announcement from building management',
        link: `/tenant/announcements?id=${announcement.id}`,
      });
    }
  }

  private parseExpiry(value: string | null | undefined): Date | null {
    if (!value) return null;
    const date = toUtcDate(value);
    if (date < todayDate()) {
      throw new BadRequestException('Expiry date cannot be in the past');
    }
    return date;
  }

  private async actorName(actor: { id: string; role: string }) {
    if (actor.role === 'manager') {
      const manager = await this.prisma.manager.findUnique({
        where: { id: actor.id },
        select: { name: true },
      });
      return manager?.name ?? 'Manager';
    }
    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: { name: true },
    });
    return user?.name ?? 'Owner';
  }

  private async log(
    action: 'create' | 'update' | 'delete' | 'status_change',
    entityId: string,
    buildingId: string,
    actor: { id: string; role: string },
    userName: string,
    details: Record<string, unknown>,
  ) {
    await this.activityLogsService.create({
      action,
      entityType: 'announcement',
      entityId,
      userId: actor.id,
      userName,
      userRole: actor.role,
      buildingId,
      details: details as Prisma.InputJsonValue,
    });
  }
}
