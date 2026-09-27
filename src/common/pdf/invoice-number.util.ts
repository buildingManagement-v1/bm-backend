import { Prisma } from 'generated/prisma/client';

const INVOICE_NUMBER = /^INV-(\d{4})-(\d{5,})$/;

/**
 * Next sequential invoice number for a building in the current year
 * (INV-2026-00001, INV-2026-00002, ...). Numbers are unique per building;
 * callers retry on a unique-constraint clash from a concurrent payment.
 */
export async function nextInvoiceNumber(
  tx: Prisma.TransactionClient,
  buildingId: string,
  at: Date = new Date(),
): Promise<string> {
  const year = at.getUTCFullYear();
  const prefix = `INV-${year}-`;
  const existing = await tx.invoice.findMany({
    where: { buildingId, invoiceNumber: { startsWith: prefix } },
    select: { invoiceNumber: true },
  });
  const last = existing.reduce((max, { invoiceNumber }) => {
    const match = INVOICE_NUMBER.exec(invoiceNumber);
    return match ? Math.max(max, Number(match[2])) : max;
  }, 0);
  return `${prefix}${String(last + 1).padStart(5, '0')}`;
}
