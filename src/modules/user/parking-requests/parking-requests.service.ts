import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { NotificationType, Prisma } from 'generated/prisma/client';
import { buildPageInfo } from 'src/common/pagination';
import { NotificationsService } from 'src/common/notifications/notifications.service';

const requestInclude = {
  tenant: { select: { id: true, name: true, email: true } },
  unit: { select: { id: true, unitNumber: true, floor: true } },
} satisfies Prisma.TenantParkingRequestInclude;

@Injectable()
export class ParkingRequestsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async findAll(
    buildingId: string,
    limit = 20,
    offset = 0,
    filters?: { status?: string; q?: string },
  ) {
    const where: Prisma.TenantParkingRequestWhereInput = { buildingId };
    if (
      filters?.status &&
      ['pending', 'approved', 'rejected'].includes(filters.status)
    ) {
      where.status = filters.status as 'pending' | 'approved' | 'rejected';
    }
    if (filters?.q?.trim()) {
      const q = filters.q.trim();
      where.OR = [
        { tenant: { name: { contains: q, mode: 'insensitive' } } },
        { tenant: { email: { contains: q, mode: 'insensitive' } } },
        { unit: { unitNumber: { contains: q, mode: 'insensitive' } } },
        { licensePlate: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [totalCount, data] = await Promise.all([
      this.prisma.tenantParkingRequest.count({ where }),
      this.prisma.tenantParkingRequest.findMany({
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
    const request = await this.prisma.tenantParkingRequest.findFirst({
      where: { id, buildingId },
      include: requestInclude,
    });
    if (!request) {
      throw new NotFoundException('Parking request not found');
    }
    return request;
  }

  async reject(
    id: string,
    buildingId: string,
    userId: string,
    rejectionReason?: string,
  ) {
    const request = await this.prisma.tenantParkingRequest.findFirst({
      where: { id, buildingId },
      include: { unit: { select: { unitNumber: true } } },
    });
    if (!request) {
      throw new NotFoundException('Parking request not found');
    }
    if (request.status !== 'pending') {
      throw new ConflictException(
        'This parking request has already been processed',
      );
    }
    await this.prisma.tenantParkingRequest.update({
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
      type: 'parking_request_updated' as NotificationType,
      title: 'Parking request rejected',
      message: `Your parking request (Unit ${request.unit.unitNumber}, ${request.licensePlate}) was rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ''}`,
      link: '/tenant/parking-requests',
    });
    return { success: true };
  }
}
