import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { SubmitMaintenanceRequestDto } from './dto';
import { NotificationsService } from 'src/common/notifications/notifications.service';
import { EmailService } from 'src/common/email/email.service';
import { buildPageInfo } from 'src/common/pagination';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class PortalService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private notificationsService: NotificationsService,
  ) {}

  async getProfile(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        building: {
          select: {
            id: true,
            name: true,
            address: true,
            city: true,
            country: true,
            contactEmail: true,
            contactPhone: true,
          },
        },
        leases: {
          where: { status: 'active' },
          orderBy: { startDate: 'desc' },
          include: {
            unit: {
              select: {
                id: true,
                unitNumber: true,
                floor: true,
                size: true,
                type: true,
                rentPrice: true,
              },
            },
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return {
      success: true,
      data: {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        phone: tenant.phone,
        status: tenant.status,
        building: tenant.building,
        leases: tenant.leases,
      },
    };
  }

  async getRentStatus(tenantId: string) {
    const leases = await this.prisma.lease.findMany({
      where: {
        tenantId,
        status: 'active',
      },
      orderBy: { startDate: 'desc' },
      include: {
        unit: {
          select: {
            id: true,
            unitNumber: true,
            floor: true,
            rentPrice: true,
          },
        },
        paymentPeriods: {
          orderBy: { month: 'desc' },
        },
      },
    });

    return {
      success: true,
      data: leases,
    };
  }

  async getPaymentHistory(tenantId: string, limit = 20, offset = 0) {
    const where = { tenantId };
    const [totalCount, data] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        include: {
          unit: {
            select: {
              id: true,
              unitNumber: true,
            },
          },
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);

    const page_info = buildPageInfo(limit, offset, totalCount);
    return {
      success: true,
      data,
      meta: { page_info },
    };
  }

  async submitMaintenanceRequest(
    tenantId: string,
    dto: SubmitMaintenanceRequestDto,
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { buildingId: true, name: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const activeLease = await this.prisma.lease.findFirst({
      where: { tenantId, status: 'active' },
      select: { unitId: true },
    });

    const request = await this.prisma.maintenanceRequest.create({
      data: {
        buildingId: tenant.buildingId,
        tenantId,
        unitId: activeLease?.unitId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority || 'medium',
        notes: [],
      },
      include: {
        unit: {
          select: {
            id: true,
            unitNumber: true,
            floor: true,
          },
        },
      },
    });

    const building = await this.prisma.building.findUnique({
      where: { id: tenant.buildingId },
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
          tenant.name,
          request.unit?.unitNumber || 'N/A',
          request.title,
          request.priority,
        );

        await this.notificationsService.create({
          userId: building.userId,
          userType: 'user',
          type: 'maintenance_request_created',
          title: 'New Maintenance Request',
          message: `${tenant.name} submitted: ${request.title}`,
          link: `/dashboard/maintenance?building=${tenant.buildingId}`,
        });
      }
    }

    return {
      success: true,
      data: request,
      message: 'Maintenance request submitted successfully',
    };
  }

  async getMaintenanceRequests(tenantId: string, limit = 20, offset = 0) {
    const where = { tenantId };
    const [totalCount, data] = await Promise.all([
      this.prisma.maintenanceRequest.count({ where }),
      this.prisma.maintenanceRequest.findMany({
        where,
        include: {
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
    return {
      success: true,
      data,
      meta: { page_info },
    };
  }

  async getMaintenanceRequest(tenantId: string, id: string) {
    const request = await this.prisma.maintenanceRequest.findFirst({
      where: { id, tenantId },
      include: {
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

    return {
      success: true,
      data: request,
    };
  }

  private getReceiptsDir(): string {
    const root = process.cwd();
    return path.join(root, 'uploads', 'receipts');
  }

  async createPaymentRequest(
    tenantId: string,
    body: {
      unitId: string;
      amount: number;
      type: string;
      paymentDate: string;
      monthsCovered?: string[];
      notes?: string;
    },
    file: { buffer: Buffer; originalname?: string },
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Receipt image is required');
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { buildingId: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    const lease = await this.prisma.lease.findFirst({
      where: {
        tenantId,
        unitId: body.unitId,
        status: 'active',
        buildingId: tenant.buildingId,
      },
    });
    if (!lease) {
      throw new BadRequestException('No active lease found for this unit');
    }
    const rawExt = path.extname(file.originalname ?? '') || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(
      rawExt.toLowerCase(),
    )
      ? rawExt.toLowerCase()
      : '.jpg';
    const filename = `${randomUUID()}${safeExt}`;
    const receiptsDir = this.getReceiptsDir();
    await fs.mkdir(receiptsDir, { recursive: true });
    const filePath = path.join(receiptsDir, filename);
    await fs.writeFile(filePath, file.buffer);

    const request = await this.prisma.tenantPaymentRequest.create({
      data: {
        buildingId: tenant.buildingId,
        tenantId,
        leaseId: lease.id,
        unitId: body.unitId,
        amount: body.amount,
        type: body.type as 'rent' | 'utility' | 'deposit' | 'other',
        paymentDate: new Date(body.paymentDate),
        monthsCovered: body.monthsCovered
          ? (body.monthsCovered as object)
          : undefined,
        notes: body.notes ?? undefined,
        receiptUrl: `receipts/${filename}`,
      },
      include: {
        unit: { select: { id: true, unitNumber: true, floor: true } },
      },
    });

    return {
      success: true,
      data: request,
      message: 'Payment request submitted. It will be reviewed by management.',
    };
  }

  async getPaymentRequests(tenantId: string, limit = 20, offset = 0) {
    const where = { tenantId };
    const [totalCount, data] = await Promise.all([
      this.prisma.tenantPaymentRequest.count({ where }),
      this.prisma.tenantPaymentRequest.findMany({
        where,
        include: {
          unit: { select: { id: true, unitNumber: true, floor: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);
    const page_info = buildPageInfo(limit, offset, totalCount);
    return { success: true, data, meta: { page_info } };
  }

  async getPaymentCalendar(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        leases: {
          where: { status: 'active' },
          include: {
            unit: { select: { id: true, unitNumber: true, floor: true } },
            paymentPeriods: { orderBy: { month: 'asc' } },
          },
        },
      },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant.leases.map((lease) => ({
      leaseId: lease.id,
      unitId: lease.unitId,
      unitNumber: lease.unit.unitNumber,
      unitFloor: lease.unit.floor ?? undefined,
      startDate: lease.startDate,
      endDate: lease.endDate,
      rentAmount: lease.rentAmount,
      periods: lease.paymentPeriods,
    }));
  }

  async getReceiptPath(tenantId: string, requestId: string): Promise<string> {
    const request = await this.prisma.tenantPaymentRequest.findFirst({
      where: { id: requestId, tenantId },
      select: { receiptUrl: true },
    });
    if (!request) {
      throw new NotFoundException('Payment request not found');
    }
    const root = process.cwd();
    return path.join(root, 'uploads', request.receiptUrl);
  }
}
