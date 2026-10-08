import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from 'generated/prisma/client';
import {
  CreatePaymentRequestDto,
  SubmitMaintenanceRequestDto,
  UpdateTenantProfileDto,
} from './dto';
import { saveUpload } from 'src/common/uploads/uploads.util';
import {
  roundMoney,
  toUtcDate,
  todayDate,
} from 'src/common/lease/lease-cycles.util';
import * as bcrypt from 'bcrypt';
import { NotificationsService } from 'src/common/notifications/notifications.service';
import { ActivityLogsService } from 'src/modules/user/activity-logs/activity-logs.service';
import { EmailService } from 'src/common/email/email.service';
import { buildPageInfo } from 'src/common/pagination';
import {
  assertRentAmountMatchesTotal,
  computeRentBaseAmount,
  computeRentTaxBreakdown,
} from 'src/common/tax/rent-period.util';
import { PdfService } from 'src/common/pdf/pdf.service';
import { loadPaymentInvoice } from 'src/common/pdf/payment-invoice.loader';

@Injectable()
export class PortalService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private notificationsService: NotificationsService,
    private activityLogsService: ActivityLogsService,
    private pdfService: PdfService,
  ) {}

  async downloadInvoice(tenantId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId },
      select: { id: true },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    return this.pdfService.generatePaymentInvoice(
      await loadPaymentInvoice(this.prisma, invoice.id),
    );
  }

  async getProfile(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
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
          where: { status: 'active', deletedAt: null },
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

  async updateProfile(tenantId: string, dto: UpdateTenantProfileDto) {
    const current = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
    });
    if (!current) {
      throw new NotFoundException('Tenant not found');
    }
    const buildingId = current.buildingId;
    const body = {
      email:
        dto.email !== undefined && dto.email !== current.email
          ? dto.email.trim().toLowerCase()
          : undefined,
    };

    if (body.email !== undefined) {
      // Email is the login id and where invoices go: confirm it's really them
      if (
        !current.passwordHash ||
        !dto.currentPassword ||
        !(await bcrypt.compare(dto.currentPassword, current.passwordHash))
      ) {
        throw new UnauthorizedException('Current password is incorrect');
      }
      const existing = await this.prisma.tenant.findFirst({
        where: { buildingId, email: body.email, deletedAt: null },
      });
      if (existing && existing.id !== tenantId) {
        throw new BadRequestException(
          'A tenant with this email already exists in this building',
        );
      }
    }
    const tenant = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(body.email !== undefined && { email: body.email }),
        ...(dto.phone !== undefined && { phone: dto.phone.trim() || null }),
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
      where: this.leasesWithRentWhere(tenantId),
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

  /** Current leases, plus ended ones that still have rent owing. */
  private leasesWithRentWhere(tenantId: string): Prisma.LeaseWhereInput {
    return {
      tenantId,
      deletedAt: null,
      OR: [
        { status: 'active' },
        { paymentPeriods: { some: { status: { in: ['unpaid', 'overdue'] } } } },
      ],
    };
  }

  /** Rent total the tenant actually pays for a base amount (VAT − WHT). */
  private async rentTotaller(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: {
        building: { select: { vatRate: true, withholdingRate: true } },
      },
    });
    const vat = Number(tenant?.building.vatRate ?? 0);
    const wht = Number(tenant?.building.withholdingRate ?? 0);
    return (base: number, applyWithholding: boolean) =>
      computeRentTaxBreakdown(base, vat, wht, applyWithholding).totalAmount;
  }

  async getPaymentHistory(tenantId: string, limit = 20, offset = 0) {
    const where = { tenantId };
    const [totalCount, rows] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        include: {
          unit: {
            select: {
              id: true,
              unitNumber: true,
              floor: true,
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

    // If unit relation is null (e.g. unit soft-deleted) but unitId is set, fetch unit for display
    const unitIdsToResolve = rows
      .filter((p) => p.unitId && !p.unit)
      .map((p) => p.unitId as string);
    const unitsMap = new Map<
      string,
      { id: string; unitNumber: string; floor: number | null }
    >();
    if (unitIdsToResolve.length > 0) {
      const units = await this.prisma.unit.findMany({
        where: { id: { in: [...new Set(unitIdsToResolve)] } },
        select: { id: true, unitNumber: true, floor: true },
      });
      for (const u of units) {
        unitsMap.set(u.id, {
          id: u.id,
          unitNumber: u.unitNumber,
          floor: u.floor,
        });
      }
    }
    const data = rows.map((p) => {
      if (p.unit) return p;
      const resolved = p.unitId ? unitsMap.get(p.unitId) : undefined;
      return resolved ? { ...p, unit: resolved } : p;
    });

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
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { buildingId: true, name: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const activeLease = await this.prisma.lease.findFirst({
      where: { tenantId, status: 'active', deletedAt: null },
      select: { unitId: true },
    });
    // Only current tenants can report issues in the building
    if (!activeLease) {
      throw new BadRequestException(
        'You need an active lease to submit maintenance requests',
      );
    }

    const request = await this.prisma.maintenanceRequest.create({
      data: {
        buildingId: tenant.buildingId,
        tenantId,
        unitId: activeLease.unitId,
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
          link: `/dashboard/maintenance-requests?building=${tenant.buildingId}`,
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
    const where = { tenantId, deletedAt: null };
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
      where: { id, tenantId, deletedAt: null },
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

  async createPaymentRequest(
    tenantId: string,
    body: CreatePaymentRequestDto,
    file: { buffer: Buffer; originalname?: string } | undefined,
  ) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      select: { buildingId: true },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    if (toUtcDate(body.paymentDate) > todayDate()) {
      throw new BadRequestException('Payment date cannot be in the future');
    }

    const months = [...new Set(body.monthsCovered ?? [])];
    if (body.type === 'rent' && months.length === 0) {
      throw new BadRequestException(
        'Rent payment requests must cover at least one payment period',
      );
    }

    // Rent goes to the lease that owns the periods (it may have ended with
    // arrears); other payments to the current lease on the unit
    const lease = await this.prisma.lease.findFirst({
      where: {
        tenantId,
        unitId: body.unitId,
        deletedAt: null,
        buildingId: tenant.buildingId,
        ...(body.type === 'rent'
          ? { paymentPeriods: { some: { month: { in: months } } } }
          : { status: 'active' as const }),
      },
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
    });
    if (!lease) {
      throw new BadRequestException(
        body.type === 'rent'
          ? 'No lease with these rent periods was found for this unit'
          : 'No active lease found for this unit',
      );
    }

    // For rent: the requested amount must match the server-computed total
    // (base from the selected periods + VAT − withholding)
    if (body.type === 'rent') {
      const [periods, building, pending] = await Promise.all([
        this.prisma.paymentPeriod.findMany({
          where: { leaseId: lease.id, month: { in: months } },
          select: { month: true, status: true, rentAmount: true },
        }),
        this.prisma.building.findUnique({
          where: { id: tenant.buildingId },
          select: { vatRate: true, withholdingRate: true },
        }),
        this.prisma.tenantPaymentRequest.findMany({
          where: { leaseId: lease.id, status: 'pending', type: 'rent' },
          select: { monthsCovered: true },
        }),
      ]);
      const alreadyRequested = pending
        .flatMap((r) => (Array.isArray(r.monthsCovered) ? r.monthsCovered : []))
        .filter(
          (m): m is string => typeof m === 'string' && months.includes(m),
        );
      if (alreadyRequested.length > 0) {
        throw new ConflictException(
          `You already have a pending request for: ${[...new Set(alreadyRequested)].join(', ')}. Wait for it to be reviewed.`,
        );
      }
      const baseAmount = computeRentBaseAmount(periods, months);
      const { totalAmount } = computeRentTaxBreakdown(
        baseAmount,
        Number(building?.vatRate ?? 0),
        Number(building?.withholdingRate ?? 0),
        lease.applyWithholding,
      );
      assertRentAmountMatchesTotal(body.amount, totalAmount);
    }

    const receiptUrl = await saveUpload(file, 'receipts', {
      allowPdf: true,
      label: 'Receipt',
    });

    const request = await this.prisma.tenantPaymentRequest.create({
      data: {
        buildingId: tenant.buildingId,
        tenantId,
        leaseId: lease.id,
        unitId: lease.unitId,
        amount: body.amount,
        type: body.type,
        paymentDate: new Date(body.paymentDate),
        monthsCovered: body.type === 'rent' ? months : undefined,
        notes: body.notes ?? undefined,
        receiptUrl,
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
    await this.notificationsService.notifyBuildingStaff(buildingId, roles, {
      type,
      title,
      message,
      link,
    });
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
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      include: {
        leases: {
          where: this.leasesWithRentWhere(tenantId),
          orderBy: { startDate: 'desc' },
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
    const building = await this.prisma.building.findUnique({
      where: { id: tenant.buildingId },
      select: { vatRate: true, withholdingRate: true },
    });
    const vatRate = Number(building?.vatRate ?? 0);
    const withholdingRate = Number(building?.withholdingRate ?? 0);
    return tenant.leases.map((lease) => ({
      leaseId: lease.id,
      unitId: lease.unitId,
      unitNumber: lease.unit.unitNumber,
      unitFloor: lease.unit.floor ?? undefined,
      status: lease.status,
      startDate: lease.startDate,
      endDate: lease.endDate,
      rentAmount: lease.rentAmount,
      applyWithholding: lease.applyWithholding,
      vatRate,
      withholdingRate,
      periods: lease.paymentPeriods,
    }));
  }

  /** Rent still to pay, oldest first; amounts include tax. */
  async getUpcomingPayments(tenantId: string, limit = 10) {
    const [periods, total] = await Promise.all([
      this.prisma.paymentPeriod.findMany({
        where: {
          lease: this.leasesWithRentWhere(tenantId),
          status: { in: ['unpaid', 'overdue'] },
        },
        orderBy: [{ periodStart: 'asc' }, { month: 'asc' }],
        take: limit,
        include: {
          lease: {
            select: {
              id: true,
              applyWithholding: true,
              unit: { select: { unitNumber: true, floor: true } },
            },
          },
        },
      }),
      this.rentTotaller(tenantId),
    ]);
    return periods.map((p) => {
      const due = p.periodStart ?? new Date(`${p.month.slice(0, 7)}-01`);
      return {
        id: p.id,
        month: p.month,
        dueDate: due,
        dueLabel: due.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }),
        baseAmount: Number(p.rentAmount),
        amount: total(Number(p.rentAmount), p.lease.applyWithholding),
        status: p.status as 'unpaid' | 'overdue',
        unitNumber: p.lease.unit.unitNumber,
        unitFloor: p.lease.unit.floor ?? undefined,
        leaseId: p.lease.id,
      };
    });
  }

  /**
   * Dashboard stats for the tenant, in what they actually pay (tax included):
   * paid so far, due now, overdue, and not yet due; plus a chart of the
   * months around today.
   */
  async getDashboardStats(tenantId: string) {
    const [periods, total] = await Promise.all([
      this.prisma.paymentPeriod.findMany({
        where: { lease: this.leasesWithRentWhere(tenantId) },
        select: {
          month: true,
          rentAmount: true,
          status: true,
          periodStart: true,
          lease: { select: { applyWithholding: true } },
        },
      }),
      this.rentTotaller(tenantId),
    ]);

    const today = todayDate();
    let paidAmount = 0;
    let unpaidAmount = 0;
    let overdueAmount = 0;
    let upcomingAmount = 0;
    const byMonth = new Map<string, { due: number; paid: number }>();

    for (const p of periods) {
      const amount = total(Number(p.rentAmount), p.lease.applyWithholding);
      const start = p.periodStart ?? new Date(`${p.month.slice(0, 7)}-01`);
      if (p.status === 'paid') paidAmount += amount;
      else if (p.status === 'overdue') overdueAmount += amount;
      else if (start <= today) unpaidAmount += amount;
      else upcomingAmount += amount;

      const key = start.toISOString().slice(0, 7);
      const existing = byMonth.get(key) ?? { due: 0, paid: 0 };
      existing.due += amount;
      if (p.status === 'paid') existing.paid += amount;
      byMonth.set(key, existing);
    }

    // Three months back through two months ahead
    const recentMonths: Array<{
      month: string;
      label: string;
      due: number;
      paid: number;
    }> = [];
    for (let offset = -3; offset <= 2; offset++) {
      const d = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1),
      );
      const month = d.toISOString().slice(0, 7);
      const { due, paid } = byMonth.get(month) ?? { due: 0, paid: 0 };
      recentMonths.push({
        month,
        label: d.toLocaleDateString('en-US', {
          month: 'short',
          year: '2-digit',
          timeZone: 'UTC',
        }),
        due: roundMoney(due),
        paid: roundMoney(paid),
      });
    }

    return {
      paymentSummary: {
        paidAmount: roundMoney(paidAmount),
        unpaidAmount: roundMoney(unpaidAmount),
        overdueAmount: roundMoney(overdueAmount),
        upcomingAmount: roundMoney(upcomingAmount),
      },
      recentMonths,
    };
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
        deletedAt: null,
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
    // Pending requests hold a slot too, so a tenant can't queue more cars
    // than the lease allows
    const [existingCount, pendingCount] = await Promise.all([
      this.prisma.parkingRegistration.count({
        where: { leaseId: lease.id, deletedAt: null },
      }),
      this.prisma.tenantParkingRequest.count({
        where: { leaseId: lease.id, status: 'pending' },
      }),
    ]);
    if (existingCount + pendingCount >= lease.carsAllowed) {
      throw new BadRequestException(
        lease.carsAllowed === 0
          ? 'Your lease does not include parking.'
          : `Parking limit reached for this lease. Maximum ${lease.carsAllowed} car(s) allowed (including pending requests).`,
      );
    }
    const existingPlate = await this.prisma.parkingRegistration.findFirst({
      where: { buildingId: lease.buildingId, licensePlate, deletedAt: null },
    });
    if (existingPlate) {
      throw new BadRequestException(
        'This license plate is already registered in this building.',
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
    return request.receiptUrl;
  }
}
