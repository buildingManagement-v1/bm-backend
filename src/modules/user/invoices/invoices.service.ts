import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from 'generated/prisma/client';
import { PdfService } from 'src/common/pdf/pdf.service';
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

  async findAll(buildingId: string, limit = 20, offset = 0) {
    const where = { buildingId };
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

    const building = await this.prisma.building.findUnique({
      where: { id: buildingId },
      select: { name: true, address: true },
    });

    return this.pdfService.generatePaymentInvoice({
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.createdAt,
      dueDate: invoice.dueDate,
      buildingName: building?.name || 'Building',
      buildingAddress: building?.address || undefined,
      tenantName: invoice.tenant?.name || 'Tenant',
      tenantEmail: invoice.tenant?.email || '',
      items: [
        {
          description: `Rent for Unit ${invoice.unit?.unitNumber || 'N/A'}`,
          amount: Number(invoice.amount),
        },
      ],
      total: Number(invoice.amount),
      status: invoice.status,
    });
  }
}
