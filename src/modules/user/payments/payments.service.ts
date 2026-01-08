import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from 'generated/prisma/client';
import { CreatePaymentDto } from './dto';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';

const paymentInclude = {
  tenant: { select: { id: true, name: true, email: true } },
  unit: { select: { id: true, unitNumber: true, floor: true } },
  invoice: { select: { id: true, invoiceNumber: true } },
} satisfies Prisma.PaymentInclude;

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
  ) {}

  async create(
    buildingId: string,
    dto: CreatePaymentDto,
    userId: string,
    userRole: string,
  ) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: dto.tenantId, buildingId },
      include: {
        unit: true,
        leases: {
          where: { status: 'active' },
          orderBy: { startDate: 'desc' },
          take: 1,
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found in this building');
    }

    const activeLease = tenant.leases[0];
    if (!activeLease) {
      throw new BadRequestException('Tenant has no active lease');
    }

    const invoiceNumber = await this.generateInvoiceNumber(buildingId);

    const payment = await this.prisma.$transaction(async (tx) => {
      const newPayment = await tx.payment.create({
        data: {
          buildingId,
          tenantId: dto.tenantId,
          unitId: tenant.unitId,
          amount: dto.amount,
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
          unitId: tenant.unitId,
          invoiceNumber,
          amount: dto.amount,
          dueDate: new Date(dto.paymentDate),
          status: 'paid',
          items: [
            {
              description: `${dto.type.charAt(0).toUpperCase() + dto.type.slice(1)} Payment`,
              amount: dto.amount,
            },
          ] as Prisma.InputJsonValue,
          notes: dto.notes,
        },
      });

      await tx.payment.update({
        where: { id: newPayment.id },
        data: { invoiceId: invoice.id },
      });

      // Mark payment periods as paid
      if (
        dto.type === 'rent' &&
        dto.monthsCovered &&
        dto.monthsCovered.length > 0
      ) {
        await tx.paymentPeriod.updateMany({
          where: {
            leaseId: activeLease.id,
            month: { in: dto.monthsCovered },
          },
          data: {
            status: 'paid',
            paidAt: new Date(dto.paymentDate),
            paymentId: newPayment.id,
          },
        });
      }

      return await tx.payment.findUnique({
        where: { id: newPayment.id },
        include: paymentInclude,
      });
    });

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

    return payment!;
  }

  async findAll(buildingId: string) {
    return await this.prisma.payment.findMany({
      where: { buildingId },
      include: paymentInclude,
      orderBy: { createdAt: 'desc' },
    });
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
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, buildingId },
      include: {
        leases: {
          where: { status: 'active' },
          include: {
            paymentPeriods: {
              orderBy: { month: 'asc' },
            },
          },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return tenant.leases.map((lease) => ({
      leaseId: lease.id,
      startDate: lease.startDate,
      endDate: lease.endDate,
      rentAmount: lease.rentAmount,
      periods: lease.paymentPeriods,
    }));
  }

  private async generateInvoiceNumber(buildingId: string): Promise<string> {
    const count = await this.prisma.invoice.count({ where: { buildingId } });
    const year = new Date().getFullYear();
    return `INV-${year}-${String(count + 1).padStart(5, '0')}`;
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
}
