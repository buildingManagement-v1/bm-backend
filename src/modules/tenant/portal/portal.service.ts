import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from 'generated/prisma/client';
import { SubmitMaintenanceRequestDto } from './dto';
import { NotificationsService } from 'src/common/notifications/notifications.service';
import { ActivityLogsService } from 'src/modules/user/activity-logs/activity-logs.service';
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
    private activityLogsService: ActivityLogsService,
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

  async updateProfile(tenantId: string, body: { email?: string }) {
    let buildingId: string | undefined;
    if (body.email !== undefined) {
      const current = await this.prisma.tenant.findFirst({
        where: { id: tenantId },
        select: { buildingId: true },
      });
      buildingId = current?.buildingId;
      if (current) {
        const existing = await this.prisma.tenant.findFirst({
          where: { buildingId: current.buildingId, email: body.email },
        });
        if (existing && existing.id !== tenantId) {
          throw new BadRequestException(
            'A tenant with this email already exists in this building',
          );
        }
      }
    }
    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(body.email !== undefined && { email: body.email }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        buildingId: true,
      },
    });
    if (body.email !== undefined && buildingId) {
      await this.activityLogsService.create({
        action: 'update',
        entityType: 'tenant',
        entityId: tenant.id,
        userId: tenantId,
        userName: tenant.name,
        userRole: 'tenant',
        buildingId,
        details: { type: 'email_change' } as Prisma.InputJsonValue,
      });
    }
    return {
      success: true,
      data: {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        phone: tenant.phone,
      },
      message: 'Profile updated successfully',
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
        tenant: { select: { name: true } },
      },
    });

    await this.notifyBuildingOwnerAndManagers(
      tenant.buildingId,
      ['payment_manager', 'operations_manager'],
      'payment_request_created',
      'New payment request',
      `${request.tenant.name} submitted a payment request (Unit ${request.unit.unitNumber}, ETB ${Number(body.amount).toLocaleString()})`,
      `/dashboard/payment-requests?building=${tenant.buildingId}`,
    );

    await this.activityLogsService.create({
      action: 'create',
      entityType: 'payment_request',
      entityId: request.id,
      userId: tenantId,
      userName: request.tenant.name,
      userRole: 'tenant',
      buildingId: tenant.buildingId,
      details: {
        amount: Number(body.amount),
        type: body.type,
        unitNumber: request.unit.unitNumber,
      } as Prisma.InputJsonValue,
    });

    return {
      success: true,
      data: request,
      message: 'Payment request submitted. It will be reviewed by management.',
    };
  }

  private async notifyBuildingOwnerAndManagers(
    buildingId: string,
    roles: Array<'payment_manager' | 'operations_manager' | 'tenant_manager'>,
    type: 'payment_request_created' | 'parking_request_created',
    title: string,
    message: string,
    link: string,
  ) {
    const building = await this.prisma.building.findUnique({
      where: { id: buildingId },
      select: { userId: true },
    });
    if (building?.userId) {
      await this.notificationsService.create({
        userId: building.userId,
        userType: 'user',
        type,
        title,
        message,
        link,
      });
    }
    const managerRoles = await this.prisma.managerBuildingRole.findMany({
      where: {
        buildingId,
        roles: { hasSome: roles },
      },
      select: { managerId: true },
    });
    for (const { managerId } of managerRoles) {
      await this.notificationsService.create({
        userId: managerId,
        userType: 'manager',
        type,
        title,
        message,
        link,
      });
    }
  }

  async getPaymentRequests(
    tenantId: string,
    limit = 20,
    offset = 0,
    q?: string,
  ) {
    const where: Prisma.TenantPaymentRequestWhereInput = { tenantId };
    if (q?.trim()) {
      const term = q.trim();
      const orConditions: Prisma.TenantPaymentRequestWhereInput[] = [
        { unit: { unitNumber: { contains: term, mode: 'insensitive' } } },
      ];
      const amountNum = Number(term);
      if (!Number.isNaN(amountNum)) {
        orConditions.push({ amount: amountNum });
      }
      where.OR = orConditions;
    }
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

  async getUpcomingPayments(tenantId: string, limit = 10) {
    const periods = await this.prisma.paymentPeriod.findMany({
      where: {
        lease: {
          tenantId,
          status: 'active',
        },
        status: { in: ['unpaid', 'overdue'] },
      },
      orderBy: { month: 'asc' },
      take: limit,
      include: {
        lease: {
          select: {
            id: true,
            unit: { select: { unitNumber: true, floor: true } },
          },
        },
      },
    });
    return periods.map((p) => {
      const [y, m] = p.month.split('-').map(Number);
      const dueLabel = new Date(y, m - 1, 1).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });
      return {
        id: p.id,
        month: p.month,
        dueLabel,
        amount: Number(p.rentAmount),
        status: p.status as 'unpaid' | 'overdue',
        unitNumber: p.lease.unit.unitNumber,
        unitFloor: p.lease.unit.floor ?? undefined,
        leaseId: p.lease.id,
      };
    });
  }

  async createParkingRequest(
    tenantId: string,
    body: { leaseId: string; licensePlate: string },
  ) {
    const licensePlate = body.licensePlate
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();
    if (!licensePlate) {
      throw new BadRequestException('License plate is required');
    }
    const lease = await this.prisma.lease.findFirst({
      where: {
        id: body.leaseId,
        tenantId,
        status: 'active',
      },
      select: {
        id: true,
        buildingId: true,
        unitId: true,
        carsAllowed: true,
      },
    });
    if (!lease) {
      throw new BadRequestException('No active lease found for this unit');
    }
    const existingCount = await this.prisma.parkingRegistration.count({
      where: { leaseId: lease.id },
    });
    if (existingCount >= lease.carsAllowed) {
      throw new BadRequestException(
        `Parking limit reached for this lease. Maximum ${lease.carsAllowed} car(s) allowed.`,
      );
    }
    const existingPlate = await this.prisma.parkingRegistration.findUnique({
      where: {
        leaseId_licensePlate: { leaseId: lease.id, licensePlate },
      },
    });
    if (existingPlate) {
      throw new BadRequestException(
        'This license plate is already registered for this unit.',
      );
    }
    const pendingSame = await this.prisma.tenantParkingRequest.findFirst({
      where: {
        leaseId: lease.id,
        licensePlate,
        status: 'pending',
      },
    });
    if (pendingSame) {
      throw new BadRequestException(
        'A pending request for this license plate on this unit already exists.',
      );
    }
    const request = await this.prisma.tenantParkingRequest.create({
      data: {
        buildingId: lease.buildingId,
        tenantId,
        leaseId: lease.id,
        unitId: lease.unitId,
        licensePlate,
      },
      include: {
        unit: { select: { id: true, unitNumber: true, floor: true } },
        tenant: { select: { name: true } },
      },
    });

    await this.notifyBuildingOwnerAndManagers(
      lease.buildingId,
      ['tenant_manager', 'operations_manager'],
      'parking_request_created',
      'New parking request',
      `${request.tenant.name} requested parking for ${licensePlate} (Unit ${request.unit.unitNumber})`,
      `/dashboard/parking-requests?building=${lease.buildingId}`,
    );

    await this.activityLogsService.create({
      action: 'create',
      entityType: 'parking_request',
      entityId: request.id,
      userId: tenantId,
      userName: request.tenant.name,
      userRole: 'tenant',
      buildingId: lease.buildingId,
      details: {
        licensePlate,
        unitNumber: request.unit.unitNumber,
      } as Prisma.InputJsonValue,
    });

    return {
      success: true,
      data: request,
      message: 'Parking request submitted. It will be reviewed by management.',
    };
  }

  async getParkingRequests(
    tenantId: string,
    limit = 20,
    offset = 0,
    q?: string,
  ) {
    const where: Prisma.TenantParkingRequestWhereInput = { tenantId };
    if (q?.trim()) {
      const term = q.trim();
      where.OR = [
        { unit: { unitNumber: { contains: term, mode: 'insensitive' } } },
        { licensePlate: { contains: term, mode: 'insensitive' } },
      ];
    }
    const [totalCount, data] = await Promise.all([
      this.prisma.tenantParkingRequest.count({ where }),
      this.prisma.tenantParkingRequest.findMany({
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
