import { Injectable } from '@nestjs/common';
import { Prisma, UserType } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActivityLogsService } from 'src/modules/user/activity-logs/activity-logs.service';
import { buildPageInfo } from 'src/common/pagination';
import { PushNotificationService } from 'src/common/firebase/push-notification.service';
import { BroadcastAudience, CreateBroadcastDto } from './broadcasts.dto';

/**
 * Platform-wide in-app notices (maintenance windows, policy changes, …).
 * Each broadcast is stored as notifications for every recipient plus one
 * platform activity log entry, which doubles as the broadcast history.
 */
@Injectable()
export class BroadcastsService {
  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
    private pushNotificationService: PushNotificationService,
  ) {}

  private async recipients(
    audience: BroadcastAudience,
  ): Promise<Array<{ userId: string; userType: UserType }>> {
    const want = (a: BroadcastAudience) =>
      audience === 'everyone' || audience === a;
    const none: Array<{ id: string }> = [];
    const [owners, managers, tenants] = await Promise.all([
      want('owners')
        ? this.prisma.user.findMany({
            where: { deletedAt: null, status: 'active' },
            select: { id: true },
          })
        : none,
      want('managers')
        ? this.prisma.manager.findMany({
            where: { deletedAt: null, status: 'active' },
            select: { id: true },
          })
        : none,
      // Tenants currently living somewhere
      want('tenants')
        ? this.prisma.tenant.findMany({
            where: {
              deletedAt: null,
              status: 'active',
              leases: { some: { status: 'active', deletedAt: null } },
            },
            select: { id: true },
          })
        : none,
    ]);
    return [
      ...owners.map((u) => ({ userId: u.id, userType: 'user' as const })),
      ...managers.map((m) => ({ userId: m.id, userType: 'manager' as const })),
      ...tenants.map((t) => ({ userId: t.id, userType: 'tenant' as const })),
    ];
  }

  async preview(audience: BroadcastAudience) {
    const list = await this.recipients(audience);
    return { recipients: list.length };
  }

  async send(dto: CreateBroadcastDto, admin: { id: string; name: string }) {
    const list = await this.recipients(dto.audience);
    const title = dto.title.trim();
    const message = dto.message.trim();
    for (let i = 0; i < list.length; i += 1000) {
      await this.prisma.notification.createMany({
        data: list.slice(i, i + 1000).map((r) => ({
          ...r,
          type: 'platform_broadcast' as const,
          title,
          message,
          link: dto.link ?? null,
        })),
      });
    }
    this.pushInBackground(list, title, message, dto.link);

    const log = await this.activityLogsService.createPlatformLog({
      action: 'create',
      entityType: 'broadcast',
      entityId: dto.audience,
      adminId: admin.id,
      adminName: admin.name,
      details: {
        title,
        message,
        audience: dto.audience,
        link: dto.link ?? null,
        recipients: list.length,
      } as Prisma.InputJsonValue,
    });
    return { id: log.id, recipients: list.length };
  }

  /** Mobile push, 20 users at a time, without holding up the request. */
  private pushInBackground(
    list: Array<{ userId: string; userType: UserType }>,
    title: string,
    message: string,
    link?: string,
  ) {
    const data: Record<string, string> = {
      type: 'platform_broadcast',
      ...(link && { link }),
    };
    void (async () => {
      for (let i = 0; i < list.length; i += 20) {
        await Promise.allSettled(
          list
            .slice(i, i + 20)
            .map((r) =>
              this.pushNotificationService.sendToUser(
                r.userId,
                r.userType,
                title,
                message,
                data,
              ),
            ),
        );
      }
    })();
  }

  async history(limit: number, offset: number) {
    const where = { entityType: 'broadcast' as const };
    const [totalCount, rows] = await Promise.all([
      this.prisma.platformActivityLog.count({ where }),
      this.prisma.platformActivityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);
    return {
      data: rows.map((r) => ({
        id: r.id,
        sentAt: r.createdAt,
        sentBy: r.adminName,
        ...(r.details as Record<string, unknown>),
      })),
      meta: { page_info: buildPageInfo(limit, offset, totalCount) },
    };
  }
}
