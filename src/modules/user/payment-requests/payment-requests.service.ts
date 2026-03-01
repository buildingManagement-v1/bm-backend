import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from 'generated/prisma/client';
import { buildPageInfo } from 'src/common/pagination';
import { NotificationsService } from 'src/common/notifications/notifications.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import * as path from 'path';

const requestInclude = {
  tenant: { select: { id: true, name: true, email: true } },
  unit: { select: { id: true, unitNumber: true, floor: true } },
} satisfies Prisma.TenantPaymentRequestInclude;

@Injectable()
export class PaymentRequestsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private activityLogsService: ActivityLogsService,
  ) {}

  private async getActorName(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    if (user?.name) return user.name;
    const manager = await this.prisma.manager.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    return manager?.name ?? 'Unknown';
  }

  async findAll(
    buildingId: string,
    limit = 20,
    offset = 0,
    filters?: { status?: string; q?: string },
  ) {
    const where: Prisma.TenantPaymentRequestWhereInput = { buildingId };
    if (
      filters?.status &&
      ['pending', 'approved', 'rejected'].includes(filters.status)
    ) {
      where.status = filters.status as 'pending' | 'approved' | 'rejected';
    }
    if (filters?.q?.trim()) {
      const q = filters.q.trim();
      const orConditions: Prisma.TenantPaymentRequestWhereInput[] = [
        { tenant: { name: { contains: q, mode: 'insensitive' } } },
        { tenant: { email: { contains: q, mode: 'insensitive' } } },
        { unit: { unitNumber: { contains: q, mode: 'insensitive' } } },
      ];
      const amountNum = Number(q);
      if (!Number.isNaN(amountNum)) {
        orConditions.push({ amount: amountNum });
      }
      where.OR = orConditions;
    }
    const [totalCount, data] = await Promise.all([
      this.prisma.tenantPaymentRequest.count({ where }),
      this.prisma.tenantPaymentRequest.findMany({
        where,
        include: requestInclude,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);
    const page_info = buildPageInfo(limit, offset, totalCount);
    return { data, meta: { page_info } };
  }

  async findOne(id: string, buildingId: string) {
    const request = await this.prisma.tenantPaymentRequest.findFirst({
      where: { id, buildingId },
      include: requestInclude,
    });
    if (!request) {
      throw new NotFoundException('Payment request not found');
    }
    return request;
  }

  async reject(
    id: string,
    buildingId: string,
    userId: string,
    rejectionReason?: string,
  ) {
    const request = await this.prisma.tenantPaymentRequest.findFirst({
      where: { id, buildingId },
      include: { unit: { select: { unitNumber: true } } },
    });
    if (!request) {
      throw new NotFoundException('Payment request not found');
    }
    if (request.status !== 'pending') {
      throw new ConflictException(
        'This payment request has already been processed',
      );
    }
    await this.prisma.tenantPaymentRequest.update({
      where: { id },
      data: {
        status: 'rejected',
        reviewedAt: new Date(),
        reviewedById: userId,
        rejectionReason: rejectionReason ?? null,
      },
    });
    await this.notificationsService.create({
      userId: request.tenantId,
      userType: 'tenant',
      type: 'payment_request_updated',
      title: 'Payment request rejected',
      message: `Your payment request (Unit ${request.unit.unitNumber}) was rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`,
      link: '/tenant/payment-requests',
    });

    const userName = await this.getActorName(userId);
    const userRole = (await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    }))
      ? 'owner'
      : 'manager';
    await this.activityLogsService.create({
      action: 'status_change',
      entityType: 'payment_request',
      entityId: id,
      userId,
      userName,
      userRole,
      buildingId,
      details: {
        status: 'rejected',
        unitNumber: request.unit.unitNumber,
        rejectionReason: rejectionReason ?? undefined,
      } as Prisma.InputJsonValue,
    });

    return { success: true };
  }

  async getReceiptPath(requestId: string, buildingId: string): Promise<string> {
    const request = await this.prisma.tenantPaymentRequest.findFirst({
      where: { id: requestId, buildingId },
      select: { receiptUrl: true },
    });
    if (!request) {
      throw new NotFoundException('Payment request not found');
    }
    const root = process.cwd();
    return path.join(root, 'uploads', request.receiptUrl);
  }
}
