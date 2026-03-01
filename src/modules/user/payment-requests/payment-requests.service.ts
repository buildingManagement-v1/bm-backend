import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from 'generated/prisma/client';
import { buildPageInfo } from 'src/common/pagination';
import * as path from 'path';

const requestInclude = {
  tenant: { select: { id: true, name: true, email: true } },
  unit: { select: { id: true, unitNumber: true, floor: true } },
} satisfies Prisma.TenantPaymentRequestInclude;

@Injectable()
export class PaymentRequestsService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    buildingId: string,
    limit = 20,
    offset = 0,
    filters?: { status?: string },
  ) {
    const where: Prisma.TenantPaymentRequestWhereInput = { buildingId };
    if (
      filters?.status &&
      ['pending', 'approved', 'rejected'].includes(filters.status)
    ) {
      where.status = filters.status as 'pending' | 'approved' | 'rejected';
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
