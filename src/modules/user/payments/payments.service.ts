import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from 'generated/prisma/client';
import { CreatePaymentDto } from './dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { EmailService } from 'src/common/email/email.service';
import { PdfService } from 'src/common/pdf/pdf.service';
import { NotificationsService } from 'src/common/notifications/notifications.service';
import { buildPageInfo } from 'src/common/pagination';
import {
  assertRentAmountMatchesTotal,
  computeRentBaseAmount,
  computeRentTaxBreakdown,
} from 'src/common/tax/rent-period.util';
import { nextInvoiceNumber } from 'src/common/pdf/invoice-number.util';
import { loadPaymentInvoice } from 'src/common/pdf/payment-invoice.loader';
import { toUtcDate, todayDate } from 'src/common/lease/lease-cycles.util';

const paymentInclude = {
  tenant: { select: { id: true, name: true, email: true } },
  unit: {
    select: { id: true, unitNumber: true, floor: true },
  },
  invoice: { select: { id: true, invoiceNumber: true } },
} satisfies Prisma.PaymentInclude;

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
    private emailService: EmailService,
    private pdfService: PdfService,
    private notificationsService: NotificationsService,
  ) {}

  async create(
    buildingId: string,
    dto: CreatePaymentDto,
    userId: string,
    userRole: string,
  ) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: dto.tenantId, buildingId, deletedAt: null },
      select: { id: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found in this building');
    }

    if (toUtcDate(dto.paymentDate) > todayDate()) {
      throw new BadRequestException('Payment date cannot be in the future');
    }

    const months = [...new Set(dto.monthsCovered ?? [])];
    if (dto.type === 'rent' && months.length === 0) {
      throw new BadRequestException(
        'Rent payments must cover at least one payment period',
      );
    }

    // Rent settles the lease that owns the periods, which may already have
    // ended (arrears after termination/expiry); other payments go to the
    // tenant's current lease on the unit, else their latest one there
    const activeLease = await this.prisma.lease.findFirst({
      where: {
        tenantId: dto.tenantId,
        unitId: dto.unitId,
        buildingId,
        deletedAt: null,
        ...(dto.type === 'rent' && {
          paymentPeriods: { some: { month: { in: months } } },
        }),
      },
      orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
    });
    if (!activeLease) {
      throw new BadRequestException('Tenant has no lease for this unit');
    }

    const [building] = await Promise.all([
      this.prisma.building.findUnique({
        where: { id: buildingId },
        select: {
          name: true,
          address: true,
          city: true,
          country: true,
          vatRate: true,
          withholdingRate: true,
        },
      }),
    ]);

    // For rent: base comes from the DB periods, tax is computed server-side,
    // and the client-sent amount must match the resulting total
    let baseAmount = dto.amount;
    let vatAmount = 0;
    let withholdingAmount = 0;
    let paymentAmount = dto.amount;

    if (dto.type === 'rent') {
      const periods = await this.prisma.paymentPeriod.findMany({
        where: { leaseId: activeLease.id, month: { in: months } },
        select: { month: true, status: true, rentAmount: true },
      });
      baseAmount = computeRentBaseAmount(periods, months);
      const breakdown = computeRentTaxBreakdown(
        baseAmount,
        Number(building?.vatRate ?? 0),
        Number(building?.withholdingRate ?? 0),
        activeLease.applyWithholding,
      );
      vatAmount = breakdown.vatAmount;
      withholdingAmount = breakdown.withholdingAmount;
      paymentAmount = breakdown.totalAmount;
      assertRentAmountMatchesTotal(dto.amount, paymentAmount);
    }

    if (baseAmount <= 0) {
      throw new BadRequestException('Payment amount must be greater than 0');
    }

    // Build invoice line items
    const invoiceItems: Array<{ description: string; amount: number }> =
      dto.type === 'rent'
        ? [
            { description: 'Base Rent', amount: baseAmount },
            ...(vatAmount > 0
              ? [
                  {
                    description: `VAT (${Number(building?.vatRate ?? 0)}%)`,
                    amount: vatAmount,
                  },
                ]
              : []),
            ...(withholdingAmount > 0
              ? [
                  {
                    description: `Withholding (${Number(building?.withholdingRate ?? 0)}%)`,
                    amount: -withholdingAmount,
                  },
                ]
              : []),
          ]
        : [
            {
              description: `${dto.type.charAt(0).toUpperCase() + dto.type.slice(1)} Payment`,
              amount: paymentAmount,
            },
          ];

    let invoiceNumber = '';
    const payment = await this.withInvoiceNumberRetry(async () =>
      this.prisma.$transaction(async (tx) => {
        invoiceNumber = await nextInvoiceNumber(tx, buildingId);
        const newPayment = await tx.payment.create({
          data: {
            buildingId,
            tenantId: dto.tenantId,
            unitId: activeLease.unitId,
            amount: paymentAmount,
            baseAmount: dto.type === 'rent' ? baseAmount : undefined,
            vatAmount: dto.type === 'rent' ? vatAmount : undefined,
            withholdingAmount:
              dto.type === 'rent' ? withholdingAmount : undefined,
            type: dto.type,
            status: 'completed',
            paymentDate: new Date(dto.paymentDate),
            notes: dto.notes,
          },
        });

        const invoice = await tx.invoice.create({
          data: {
            buildingId,
            tenantId: dto.tenantId,
            unitId: activeLease.unitId,
            invoiceNumber,
            amount: paymentAmount,
            dueDate: new Date(dto.paymentDate),
            status: 'paid',
            items: invoiceItems as Prisma.InputJsonValue,
            notes: dto.notes,
          },
        });

        await tx.payment.update({
          where: { id: newPayment.id },
          data: { invoiceId: invoice.id },
        });

        // Mark payment periods as paid; only still-open periods can be claimed,
        // so a concurrent payment for the same months rolls this one back
        if (dto.type === 'rent') {
          const claimed = await tx.paymentPeriod.updateMany({
            where: {
              leaseId: activeLease.id,
              month: { in: months },
              status: { in: ['unpaid', 'overdue'] },
            },
            data: {
              status: 'paid',
              paidAt: new Date(dto.paymentDate),
              paymentId: newPayment.id,
            },
          });
          if (claimed.count !== months.length) {
            throw new ConflictException(
              'Some of these periods were just paid by another payment. Refresh and try again.',
            );
          }
        }

        return await tx.payment.findUnique({
          where: { id: newPayment.id },
          include: paymentInclude,
        });
      }),
    );

    const userName = await this.getUserName(userId, userRole);
    await this.activityLogsService.create({
      action: 'create',
      entityType: 'payment',
      entityId: payment!.id,
      userId,
      userName,
      userRole,
      buildingId,
      details: {
        amount: payment!.amount,
        type: payment!.type,
        tenantId: payment!.tenantId,
        invoiceNumber,
      } as Prisma.InputJsonValue,
    });

    // Same document the owner and tenant download later
    const pdfDoc = this.pdfService.generatePaymentInvoice(
      await loadPaymentInvoice(this.prisma, payment!.invoice!.id),
    );

    // Convert PDF stream to buffer
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      pdfDoc.on('data', (chunk) => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
    });

    // Send email with PDF invoice
    await this.emailService.sendPaymentInvoiceEmail(
      payment!.tenant.email,
      payment!.tenant.name,
      Number(payment!.amount),
      payment!.paymentDate,
      invoiceNumber,
      pdfBuffer,
    );

    return payment!;
  }

  async findAll(
    buildingId: string,
    limit = 20,
    offset = 0,
    filters?: { type?: string; status?: string; q?: string },
  ) {
    const where: Prisma.PaymentWhereInput = { buildingId };
    if (
      filters?.type &&
      ['rent', 'utility', 'deposit', 'other'].includes(filters.type)
    ) {
      where.type = filters.type as 'rent' | 'utility' | 'deposit' | 'other';
    }
    if (
      filters?.status &&
      ['pending', 'completed', 'failed', 'cancelled'].includes(filters.status)
    ) {
      where.status = filters.status as
        | 'pending'
        | 'completed'
        | 'failed'
        | 'cancelled';
    }
    if (filters?.q?.trim()) {
      where.tenant = {
        name: { contains: filters.q.trim(), mode: 'insensitive' },
      };
    }
    const [totalCount, rows] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        include: paymentInclude,
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
    return { data, meta: { page_info } };
  }

  async findOne(id: string, buildingId: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, buildingId },
      include: {
        ...paymentInclude,
        invoice: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    return payment;
  }

  async getPaymentCalendar(buildingId: string, tenantId: string) {
    const [tenant, building] = await Promise.all([
      this.prisma.tenant.findFirst({
        where: { id: tenantId, buildingId, deletedAt: null },
        include: {
          // Current leases, plus ended ones that still have rent owing
          leases: {
            where: {
              deletedAt: null,
              OR: [
                { status: 'active' },
                {
                  paymentPeriods: {
                    some: { status: { in: ['unpaid', 'overdue'] } },
                  },
                },
              ],
            },
            orderBy: { startDate: 'desc' },
            include: {
              unit: { select: { id: true, unitNumber: true, floor: true } },
              paymentPeriods: { orderBy: { month: 'asc' } },
            },
          },
        },
      }),
      this.prisma.building.findUnique({
        where: { id: buildingId },
        select: { vatRate: true, withholdingRate: true },
      }),
    ]);

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

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

  /** Retries when two payments race for the same invoice number. */
  private async withInvoiceNumberRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (error) {
        const isNumberClash =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002';
        if (!isNumberClash || attempt >= 4) throw error;
      }
    }
  }

  private async getUserName(userId: string, userRole: string): Promise<string> {
    if (userRole === 'manager') {
      const manager = await this.prisma.manager.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      return manager?.name || 'Unknown';
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    return user?.name || 'Unknown';
  }

  async createFromRequest(
    requestId: string,
    buildingId: string,
    userId: string,
    userRole: string,
  ) {
    const request = await this.prisma.tenantPaymentRequest.findFirst({
      where: { id: requestId, buildingId, tenant: { deletedAt: null } },
      include: {
        tenant: { select: { id: true } },
        unit: { select: { unitNumber: true } },
      },
    });
    if (!request) {
      throw new NotFoundException('Payment request not found');
    }
    if (request.status !== 'pending') {
      throw new ConflictException(
        'This payment request has already been processed',
      );
    }
    // Claim the request first so two reviewers can't both approve it
    const claim = await this.prisma.tenantPaymentRequest.updateMany({
      where: { id: requestId, status: 'pending' },
      data: {
        status: 'approved',
        reviewedAt: new Date(),
        reviewedById: userId,
      },
    });
    if (claim.count === 0) {
      throw new ConflictException(
        'This payment request has already been processed',
      );
    }
    const monthsCovered = request.monthsCovered as string[] | undefined;
    const dto: CreatePaymentDto = {
      tenantId: request.tenantId,
      unitId: request.unitId,
      amount: Number(request.amount),
      type: request.type,
      paymentDate: request.paymentDate.toISOString(),
      monthsCovered,
      notes: request.notes ?? undefined,
    };
    let payment: Awaited<ReturnType<PaymentsService['create']>>;
    try {
      payment = await this.create(buildingId, dto, userId, userRole);
    } catch (error) {
      // Recording failed (e.g. amount no longer matches): hand it back
      await this.prisma.tenantPaymentRequest.update({
        where: { id: requestId },
        data: { status: 'pending', reviewedAt: null, reviewedById: null },
      });
      throw error;
    }
    await this.notificationsService.create({
      userId: request.tenantId,
      userType: 'tenant',
      type: 'payment_request_updated',
      title: 'Payment request approved',
      message: `Your payment request (Unit ${request.unit.unitNumber}, ETB ${Number(request.amount).toLocaleString()}) has been approved and recorded.`,
      link: '/tenant/payment-requests',
    });

    const userName = await this.getUserName(userId, userRole);
    await this.activityLogsService.create({
      action: 'status_change',
      entityType: 'payment_request',
      entityId: requestId,
      userId,
      userName,
      userRole,
      buildingId,
      details: {
        status: 'approved',
        unitNumber: request.unit.unitNumber,
        amount: Number(request.amount),
        paymentId: payment.id,
      } as Prisma.InputJsonValue,
    });

    return payment;
  }
}
