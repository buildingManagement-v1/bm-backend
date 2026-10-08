import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { APP_TIMEZONE } from '../lease/lease-cycles.util';
import type { InvoiceLineItem } from './invoice-items.util';

/** A rent invoice/receipt as loaded by loadPaymentInvoice() */
export interface PaymentInvoiceData {
  invoiceNumber: string;
  issuedAt: Date;
  paidAt: Date;
  status: string;
  building: {
    name: string;
    addressLines: string[];
    email?: string;
    phone?: string;
  };
  tenant: { name: string; email: string; phone?: string; tin?: string };
  unitNumber?: string;
  paymentType?: string;
  /** Rent cycles this payment settled, oldest first */
  periods: { start: Date; end: Date; amount: number }[];
  /** Stored line items: base amount(s) plus VAT / withholding rows */
  items: InvoiceLineItem[];
  total: number;
  notes?: string;
}

interface SubscriptionInvoiceData {
  invoiceNumber: string;
  date: Date;
  userName: string;
  userEmail: string;
  planName: string;
  totalAmount: number;
  billingPeriod: {
    start: Date;
    end: Date;
  };
  proratedAmount?: number;
}

/** Layout-level description of a one-page financial document */
interface DocumentSpec {
  title: string;
  number: string;
  status?: string;
  issuer: { name: string; lines: string[] };
  meta: { label: string; value: string }[];
  parties: { label: string; name: string; lines: string[] }[];
  detailHeader?: string;
  lines: { description: string; detail?: string; amount: number }[];
  adjustments: { label: string; amount: number }[];
  totalLabel: string;
  total: number;
  notes?: string;
  contact: string;
}

const PAGE = { width: 595.28, height: 841.89, margin: 48 };
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;
const COLOR = {
  ink: '#0F172A',
  body: '#334155',
  muted: '#64748B',
  faint: '#94A3B8',
  hairline: '#E2E8F0',
  panel: '#F8FAFC',
  tableHead: '#F1F5F9',
  accent: '#2563EB',
  headerText: '#CBD5E1',
  paid: '#16A34A',
  pending: '#D97706',
};
const TAX_ROW = /^(VAT|Withholding)\b/i;

export function formatMoney(amount: number): string {
  const value = Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${amount < 0 ? '– ' : ''}ETB ${value}`;
}

function formatDay(date: Date): string {
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: APP_TIMEZONE,
  });
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

@Injectable()
export class PdfService {
  generatePaymentInvoice(data: PaymentInvoiceData): PDFKit.PDFDocument {
    const unit = data.unitNumber ? `Unit ${data.unitNumber}` : undefined;
    const taxes = data.items.filter((i) => TAX_ROW.test(i.description));
    const baseItems = data.items.filter((i) => !TAX_ROW.test(i.description));

    // Rent is itemized per cycle when the cycles add up to the billed base
    const baseTotal = baseItems.reduce((sum, i) => sum + i.amount, 0);
    const periodTotal = data.periods.reduce((sum, p) => sum + p.amount, 0);
    const itemizePeriods =
      data.paymentType === 'rent' &&
      data.periods.length > 0 &&
      Math.abs(periodTotal - baseTotal) < 0.01;

    const lines = itemizePeriods
      ? data.periods.map((p) => ({
          description: unit ? `Rent · ${unit}` : 'Rent',
          detail: `${formatDay(p.start)} – ${formatDay(p.end)}`,
          amount: p.amount,
        }))
      : baseItems.map((i) => ({
          description: unit ? `${i.description} · ${unit}` : i.description,
          amount: i.amount,
        }));

    const tenantLines = [
      data.tenant.email,
      data.tenant.phone,
      data.tenant.tin ? `TIN ${data.tenant.tin}` : undefined,
    ].filter((l): l is string => !!l);

    const covered =
      data.periods.length > 0
        ? `${formatDay(data.periods[0].start)} – ${formatDay(data.periods[data.periods.length - 1].end)}`
        : undefined;

    return this.render({
      title: 'INVOICE',
      number: data.invoiceNumber,
      status: data.status,
      issuer: {
        name: data.building.name,
        lines: [
          ...data.building.addressLines,
          [data.building.phone, data.building.email]
            .filter(Boolean)
            .join('  ·  '),
        ].filter(Boolean),
      },
      meta: [
        { label: 'Issued', value: formatDay(data.issuedAt) },
        { label: 'Paid on', value: formatDay(data.paidAt) },
        {
          label: 'Payment for',
          value: data.paymentType ? capitalize(data.paymentType) : '—',
        },
        { label: 'Unit', value: data.unitNumber ?? '—' },
      ],
      parties: [
        { label: 'Billed to', name: data.tenant.name, lines: tenantLines },
        {
          label: 'Property',
          name: data.building.name,
          lines: [unit, covered ? `Period ${covered}` : undefined].filter(
            (l): l is string => !!l,
          ),
        },
      ],
      detailHeader: itemizePeriods ? 'Period' : undefined,
      lines,
      adjustments: taxes.map((t) => ({
        label: t.description,
        amount: t.amount,
      })),
      totalLabel: data.status === 'paid' ? 'Total paid' : 'Total due',
      total: data.total,
      notes: data.notes,
      contact: [data.building.name, data.building.phone, data.building.email]
        .filter(Boolean)
        .join('  ·  '),
    });
  }

  generateSubscriptionInvoice(
    data: SubscriptionInvoiceData,
  ): PDFKit.PDFDocument {
    const total = data.proratedAmount ?? data.totalAmount;
    return this.render({
      title: 'INVOICE',
      number: data.invoiceNumber,
      issuer: { name: 'BMS', lines: ['Building Management System'] },
      meta: [
        { label: 'Issued', value: formatDay(data.date) },
        { label: 'Plan', value: data.planName },
        { label: 'Starts', value: formatDay(data.billingPeriod.start) },
        { label: 'Renews', value: formatDay(data.billingPeriod.end) },
      ],
      parties: [
        { label: 'Billed to', name: data.userName, lines: [data.userEmail] },
      ],
      detailHeader: 'Period',
      lines: [
        {
          description: `${data.planName} plan · annual subscription`,
          detail: `${formatDay(data.billingPeriod.start)} – ${formatDay(data.billingPeriod.end)}`,
          amount: data.totalAmount,
        },
      ],
      adjustments:
        data.proratedAmount !== undefined
          ? [
              {
                label: 'Proration credit',
                amount: data.proratedAmount - data.totalAmount,
              },
            ]
          : [],
      totalLabel: 'Total',
      total,
      contact: 'BMS · Building Management System',
    });
  }

  // ---------------------------------------------------------------------------

  private render(spec: DocumentSpec): PDFKit.PDFDocument {
    const doc = new PDFDocument({
      size: 'A4',
      // The footer sits below the usual bottom margin; a smaller one keeps
      // PDFKit from pushing it onto a second page
      margins: {
        top: PAGE.margin,
        left: PAGE.margin,
        right: PAGE.margin,
        bottom: 24,
      },
      info: { Title: `${spec.title} ${spec.number}`, Author: spec.issuer.name },
    });
    const { margin } = PAGE;
    const right = margin + CONTENT_WIDTH;

    // ---- Header band ----
    doc.rect(0, 0, PAGE.width, 124).fill(COLOR.ink);
    doc.rect(0, 124, PAGE.width, 3).fill(COLOR.accent);

    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor('#FFFFFF')
      .text(spec.issuer.name, margin, 38, { width: 300, lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor(COLOR.headerText);
    spec.issuer.lines.slice(0, 3).forEach((line, i) => {
      doc.text(line, margin, 64 + i * 13, { width: 300, lineBreak: false });
    });

    doc
      .font('Helvetica-Bold')
      .fontSize(22)
      .fillColor('#FFFFFF')
      .text(spec.title, margin, 36, {
        width: CONTENT_WIDTH,
        align: 'right',
        characterSpacing: 4,
      });
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(COLOR.headerText)
      .text(spec.number, margin, 66, { width: CONTENT_WIDTH, align: 'right' });

    if (spec.status) {
      const label = spec.status.toUpperCase();
      doc.font('Helvetica-Bold').fontSize(8);
      const pillWidth = doc.widthOfString(label, { characterSpacing: 1 }) + 22;
      const pillX = right - pillWidth;
      doc
        .roundedRect(pillX, 86, pillWidth, 18, 9)
        .fill(spec.status === 'paid' ? COLOR.paid : COLOR.pending);
      doc.fillColor('#FFFFFF').text(label, pillX, 91.5, {
        width: pillWidth,
        align: 'center',
        characterSpacing: 1,
      });
    }

    // ---- Meta strip ----
    let y = 150;
    doc
      .roundedRect(margin, y, CONTENT_WIDTH, 50, 6)
      .lineWidth(0.75)
      .fillAndStroke(COLOR.panel, COLOR.hairline);
    const cellWidth = CONTENT_WIDTH / spec.meta.length;
    spec.meta.forEach((m, i) => {
      const x = margin + 16 + i * cellWidth;
      this.label(doc, m.label, x, y + 12, cellWidth - 20);
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(COLOR.ink)
        .text(m.value, x, y + 27, { width: cellWidth - 20, lineBreak: false });
    });

    // ---- Parties ----
    y += 74;
    const partyWidth = CONTENT_WIDTH / 2 - 12;
    let partiesBottom = y;
    spec.parties.forEach((party, i) => {
      const x = margin + i * (partyWidth + 24);
      this.label(doc, party.label, x, y, partyWidth);
      doc
        .font('Helvetica-Bold')
        .fontSize(11.5)
        .fillColor(COLOR.ink)
        .text(party.name, x, y + 15, { width: partyWidth });
      let lineY = doc.y + 3;
      doc.font('Helvetica').fontSize(9.5).fillColor(COLOR.body);
      for (const line of party.lines) {
        doc.text(line, x, lineY, { width: partyWidth });
        lineY = doc.y + 2;
      }
      partiesBottom = Math.max(partiesBottom, lineY);
    });

    // ---- Line items ----
    y = partiesBottom + 26;
    const amountWidth = 120;
    const amountX = right - 12 - amountWidth;
    const detailX = margin + CONTENT_WIDTH * 0.5;
    const descWidth = (spec.detailHeader ? detailX : amountX) - margin - 24;

    doc.rect(margin, y, CONTENT_WIDTH, 24).fill(COLOR.tableHead);
    this.label(doc, 'Description', margin + 12, y + 8.5, descWidth);
    if (spec.detailHeader) {
      this.label(doc, spec.detailHeader, detailX, y + 8.5, 160);
    }
    this.label(doc, 'Amount', amountX, y + 8.5, amountWidth, 'right');
    y += 24;

    for (const line of spec.lines) {
      if (y > PAGE.height - 260) {
        doc.addPage();
        y = margin;
      }
      doc
        .font('Helvetica')
        .fontSize(10)
        .fillColor(COLOR.ink)
        .text(line.description, margin + 12, y + 10, { width: descWidth });
      if (line.detail) {
        doc
          .fontSize(9.5)
          .fillColor(COLOR.body)
          .text(line.detail, detailX, y + 10.5, { width: 160 });
      }
      doc
        .fontSize(10)
        .fillColor(COLOR.ink)
        .text(formatMoney(line.amount), amountX, y + 10, {
          width: amountWidth,
          align: 'right',
        });
      y += 32;
      doc
        .moveTo(margin, y)
        .lineTo(right, y)
        .lineWidth(0.75)
        .strokeColor(COLOR.hairline)
        .stroke();
    }

    // ---- Totals ----
    y += 16;
    const totalsWidth = 260;
    const totalsX = right - totalsWidth;
    const subtotal = spec.lines.reduce((sum, l) => sum + l.amount, 0);
    const totalsRows =
      spec.adjustments.length > 0
        ? [{ label: 'Subtotal', amount: subtotal }, ...spec.adjustments]
        : [];
    for (const row of totalsRows) {
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(COLOR.body)
        .text(row.label, totalsX, y, { width: totalsWidth - 12 - amountWidth })
        .fillColor(COLOR.ink)
        .text(formatMoney(row.amount), right - 12 - amountWidth, y, {
          width: amountWidth,
          align: 'right',
        });
      y += 20;
    }

    y += 4;
    doc.roundedRect(totalsX - 12, y, totalsWidth + 12, 42, 6).fill(COLOR.ink);
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(COLOR.headerText)
      .text(spec.totalLabel.toUpperCase(), totalsX + 4, y + 16, {
        characterSpacing: 0.8,
        lineBreak: false,
      });
    doc
      .fontSize(15)
      .fillColor('#FFFFFF')
      .text(formatMoney(spec.total), totalsX, y + 13, {
        width: totalsWidth - 12,
        align: 'right',
        lineBreak: false,
      });
    y += 66;

    // ---- Notes ----
    if (spec.notes) {
      this.label(doc, 'Notes', margin, y, CONTENT_WIDTH);
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(COLOR.body)
        .text(spec.notes, margin, y + 15, { width: CONTENT_WIDTH });
    }

    // ---- Footer ----
    const footerY = PAGE.height - 72;
    doc
      .moveTo(margin, footerY)
      .lineTo(right, footerY)
      .lineWidth(0.75)
      .strokeColor(COLOR.hairline)
      .stroke();
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(COLOR.muted)
      .text(spec.contact, margin, footerY + 12, {
        width: CONTENT_WIDTH * 0.6,
        lineBreak: false,
      })
      .text(`${spec.title} ${spec.number}`, margin, footerY + 12, {
        width: CONTENT_WIDTH,
        align: 'right',
        lineBreak: false,
      });
    doc
      .fontSize(7.5)
      .fillColor(COLOR.faint)
      .text(
        'This document was generated electronically and is valid without a signature.',
        margin,
        footerY + 28,
        { width: CONTENT_WIDTH, align: 'center', lineBreak: false },
      );

    doc.end();
    return doc;
  }

  /** Small uppercase caption used for every field label */
  private label(
    doc: PDFKit.PDFDocument,
    text: string,
    x: number,
    y: number,
    width: number,
    align: 'left' | 'right' = 'left',
  ) {
    doc
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .fillColor(COLOR.muted)
      .text(text.toUpperCase(), x, y, {
        width,
        align,
        characterSpacing: 0.8,
        lineBreak: false,
      });
  }
}
