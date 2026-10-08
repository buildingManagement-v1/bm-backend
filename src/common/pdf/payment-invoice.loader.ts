import { PrismaService } from '../../prisma/prisma.service';
import { toUtcDate } from '../lease/lease-cycles.util';
import { parseInvoiceItems } from './invoice-items.util';
import type { PaymentInvoiceData } from './pdf.service';

/**
 * Everything the invoice PDF shows, loaded from the invoice row so the
 * emailed copy, the owner's download and the tenant's download are identical.
 * Callers check access to the invoice first.
 */
export async function loadPaymentInvoice(
  prisma: PrismaService,
  invoiceId: string,
): Promise<PaymentInvoiceData> {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    select: {
      invoiceNumber: true,
      amount: true,
      dueDate: true,
      createdAt: true,
      status: true,
      items: true,
      notes: true,
      unit: { select: { unitNumber: true } },
      tenant: { select: { name: true, email: true, phone: true, tin: true } },
      building: {
        select: {
          name: true,
          address: true,
          city: true,
          country: true,
          contactEmail: true,
          contactPhone: true,
        },
      },
      payments: {
        take: 1,
        orderBy: { createdAt: 'asc' },
        select: {
          type: true,
          paymentDate: true,
          paymentPeriods: {
            orderBy: { month: 'asc' },
            select: {
              month: true,
              periodStart: true,
              periodEnd: true,
              rentAmount: true,
            },
          },
        },
      },
    },
  });

  const payment = invoice.payments[0];
  const { building, tenant } = invoice;
  return {
    invoiceNumber: invoice.invoiceNumber,
    issuedAt: invoice.createdAt,
    paidAt: payment?.paymentDate ?? invoice.dueDate,
    status: invoice.status,
    building: {
      name: building.name,
      addressLines: [
        building.address,
        [building.city, building.country].filter(Boolean).join(', '),
      ].filter((l): l is string => !!l),
      email: building.contactEmail ?? undefined,
      phone: building.contactPhone ?? undefined,
    },
    tenant: {
      name: tenant.name,
      email: tenant.email,
      phone: tenant.phone ?? undefined,
      tin: tenant.tin ?? undefined,
    },
    unitNumber: invoice.unit?.unitNumber,
    paymentType: payment?.type,
    periods: (payment?.paymentPeriods ?? []).map((p) => {
      // Legacy rows only carry a YYYY-MM month
      const start = p.periodStart ?? toUtcDate(`${p.month.slice(0, 7)}-01`);
      const end =
        p.periodEnd ??
        new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
      return { start, end, amount: Number(p.rentAmount) };
    }),
    items: parseInvoiceItems(invoice.items, {
      description: payment?.type === 'rent' ? 'Rent' : 'Payment',
      amount: Number(invoice.amount),
    }),
    total: Number(invoice.amount),
    notes: invoice.notes ?? undefined,
  };
}
