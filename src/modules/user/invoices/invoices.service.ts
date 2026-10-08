import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from 'generated/prisma/client';
import { PdfService } from 'src/common/pdf/pdf.service';
import { loadPaymentInvoice } from 'src/common/pdf/payment-invoice.loader';
import { buildPageInfo } from 'src/common/pagination';

const invoiceInclude = {
  tenant: { select: { id: true, name: true, email: true } },
  unit: { select: { id: true, unitNumber: true, floor: true } },
  payments: {
    select: { id: true, amount: true, paymentDate: true, status: true },
  },
} satisfies Prisma.InvoiceInclude;

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private pdfService: PdfService,
  ) {}

  async findAll(
    buildingId: string,
    limit = 20,
    offset = 0,
    filters?: { status?: string; q?: string },
  ) {
    const where: Prisma.InvoiceWhereInput = { buildingId };
    if (
      filters?.status &&
      ['draft', 'sent', 'paid', 'overdue', 'cancelled'].includes(filters.status)
    ) {
      where.status = filters.status as
        | 'draft'
        | 'sent'
        | 'paid'
        | 'overdue'
        | 'cancelled';
    }
    if (filters?.q?.trim()) {
      where.invoiceNumber = {
        contains: filters.q.trim(),
        mode: 'insensitive',
      };
    }
    const [totalCount, data] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        include: invoiceInclude,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);
    const page_info = buildPageInfo(limit, offset, totalCount);
    return { data, meta: { page_info } };
  }

  async findOne(id: string, buildingId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, buildingId },
      include: invoiceInclude,
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    return invoice;
  }

  async downloadInvoice(id: string, buildingId: string) {
    const invoice = await this.findOne(id, buildingId);
    return this.pdfService.generatePaymentInvoice(
      await loadPaymentInvoice(this.prisma, invoice.id),
    );
  }
}
