import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

interface InvoiceData {
  invoiceNumber: string;
  date: Date;
  dueDate?: Date;
  buildingName: string;
  buildingAddress?: string;
  tenantName: string;
  tenantEmail: string;
  items: {
    description: string;
    amount: number;
  }[];
  total: number;
  status?: string;
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

@Injectable()
export class PdfService {
  generatePaymentInvoice(data: InvoiceData): PDFKit.PDFDocument {
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });

    // Thin top accent line
    doc.rect(0, 0, 612, 3).fill('#3B82F6');

    // Invoice title - minimal, elegant
    doc
      .fontSize(28)
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .text('INVOICE', 50, 40);

    // Invoice details - right aligned
    doc
      .fontSize(9)
      .fillColor('#6B7280')
      .font('Helvetica')
      .text('Invoice Number', 400, 50, { align: 'right' })
      .fontSize(10)
      .fillColor('#111827')
      .text(data.invoiceNumber, 400, 65, { align: 'right' });

    doc
      .fontSize(9)
      .fillColor('#6B7280')
      .text('Invoice Date', 400, 85, { align: 'right' })
      .fontSize(10)
      .fillColor('#111827')
      .text(data.date.toLocaleDateString(), 400, 100, { align: 'right' });

    if (data.dueDate) {
      doc
        .fontSize(9)
        .fillColor('#6B7280')
        .text('Due Date', 400, 120, { align: 'right' })
        .fontSize(10)
        .fillColor('#111827')
        .text(data.dueDate.toLocaleDateString(), 400, 135, { align: 'right' });
    }

    // From section
    doc
      .fontSize(9)
      .fillColor('#6B7280')
      .font('Helvetica')
      .text('FROM', 50, 120);

    doc
      .fontSize(11)
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .text(data.buildingName, 50, 135);

    if (data.buildingAddress) {
      doc
        .fontSize(10)
        .fillColor('#6B7280')
        .font('Helvetica')
        .text(data.buildingAddress, 50, 150, { width: 250 });
    }

    // Bill To section
    doc
      .fontSize(9)
      .fillColor('#6B7280')
      .font('Helvetica')
      .text('BILL TO', 50, 200);

    doc
      .fontSize(11)
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .text(data.tenantName, 50, 215);

    doc
      .fontSize(10)
      .fillColor('#6B7280')
      .font('Helvetica')
      .text(data.tenantEmail, 50, 230);

    // Status badge (if exists) - minimal
    if (data.status) {
      const statusColor = data.status === 'paid' ? '#10B981' : '#F59E0B';
      doc
        .fontSize(9)
        .fillColor(statusColor)
        .font('Helvetica-Bold')
        .text(data.status.toUpperCase(), 50, 260);
    }

    // Divider line
    doc.moveTo(50, 290).lineTo(562, 290).strokeColor('#E5E7EB').stroke();

    // Items table header
    const tableTop = 310;
    doc
      .fontSize(9)
      .fillColor('#6B7280')
      .font('Helvetica-Bold')
      .text('DESCRIPTION', 50, tableTop)
      .text('AMOUNT', 480, tableTop, { align: 'right' });

    // Items
    let yPosition = tableTop + 25;
    doc.fillColor('#111827').font('Helvetica');

    data.items.forEach((item) => {
      doc
        .fontSize(10)
        .text(item.description, 50, yPosition, { width: 400 })
        .text(`$${item.amount.toFixed(2)}`, 480, yPosition, { align: 'right' });
      yPosition += 25;
    });

    // Divider before total
    yPosition += 10;
    doc
      .moveTo(50, yPosition)
      .lineTo(562, yPosition)
      .strokeColor('#E5E7EB')
      .stroke();

    yPosition += 20;

    // Total - clean and prominent
    doc
      .fontSize(11)
      .fillColor('#6B7280')
      .font('Helvetica-Bold')
      .text('TOTAL', 50, yPosition);

    doc
      .fontSize(20)
      .fillColor('#111827')
      .text(`$${data.total.toFixed(2)}`, 480, yPosition - 3, {
        align: 'right',
      });

    // Footer - minimal
    doc
      .fontSize(8)
      .fillColor('#9CA3AF')
      .font('Helvetica')
      .text('Thank you for your payment', 50, 720, {
        align: 'center',
        width: 512,
      });

    doc.end();
    return doc;
  }

  generateSubscriptionInvoice(
    data: SubscriptionInvoiceData,
  ): PDFKit.PDFDocument {
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });

    // Thin top accent line
    doc.rect(0, 0, 612, 3).fill('#8B5CF6');

    // Invoice title
    doc
      .fontSize(28)
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .text('INVOICE', 50, 40);

    doc
      .fontSize(11)
      .fillColor('#6B7280')
      .font('Helvetica')
      .text('Subscription', 50, 75);

    // Invoice details - right aligned
    doc
      .fontSize(9)
      .fillColor('#6B7280')
      .text('Invoice Number', 400, 50, { align: 'right' })
      .fontSize(10)
      .fillColor('#111827')
      .text(data.invoiceNumber, 400, 65, { align: 'right' });

    doc
      .fontSize(9)
      .fillColor('#6B7280')
      .text('Invoice Date', 400, 85, { align: 'right' })
      .fontSize(10)
      .fillColor('#111827')
      .text(data.date.toLocaleDateString(), 400, 100, { align: 'right' });

    // Bill To section
    doc
      .fontSize(9)
      .fillColor('#6B7280')
      .font('Helvetica')
      .text('BILL TO', 50, 120);

    doc
      .fontSize(11)
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .text(data.userName, 50, 135);

    doc
      .fontSize(10)
      .fillColor('#6B7280')
      .font('Helvetica')
      .text(data.userEmail, 50, 150);

    // Plan and billing period
    doc
      .fontSize(9)
      .fillColor('#6B7280')
      .text('PLAN', 50, 180)
      .fontSize(11)
      .fillColor('#111827')
      .font('Helvetica-Bold')
      .text(data.planName, 50, 195);

    doc
      .fontSize(9)
      .fillColor('#6B7280')
      .font('Helvetica')
      .text('BILLING PERIOD', 50, 220)
      .fontSize(10)
      .fillColor('#111827')
      .text(
        `${data.billingPeriod.start.toLocaleDateString()} - ${data.billingPeriod.end.toLocaleDateString()}`,
        50,
        235,
      );

    // Divider line
    doc.moveTo(50, 270).lineTo(562, 270).strokeColor('#E5E7EB').stroke();

    // Items table header
    const tableTop = 290;
    doc
      .fontSize(9)
      .fillColor('#6B7280')
      .font('Helvetica-Bold')
      .text('DESCRIPTION', 50, tableTop)
      .text('AMOUNT', 480, tableTop, { align: 'right' });

    // Subscription item
    let yPosition = tableTop + 25;
    doc
      .fontSize(10)
      .fillColor('#111827')
      .font('Helvetica')
      .text(`${data.planName} - Annual Subscription`, 50, yPosition)
      .text(`$${data.totalAmount.toFixed(2)}`, 480, yPosition, {
        align: 'right',
      });

    yPosition += 30;

    // Prorated amount if exists
    if (data.proratedAmount !== undefined) {
      doc
        .fontSize(10)
        .fillColor('#6B7280')
        .text('Prorated Adjustment', 50, yPosition)
        .fillColor(data.proratedAmount >= 0 ? '#111827' : '#10B981')
        .text(
          `${data.proratedAmount >= 0 ? '' : '-'}$${Math.abs(data.proratedAmount).toFixed(2)}`,
          480,
          yPosition,
          { align: 'right' },
        );
      yPosition += 30;
    }

    // Divider before total
    doc
      .moveTo(50, yPosition)
      .lineTo(562, yPosition)
      .strokeColor('#E5E7EB')
      .stroke();

    yPosition += 20;

    // Total
    const finalAmount =
      data.proratedAmount !== undefined
        ? data.proratedAmount
        : data.totalAmount;

    doc
      .fontSize(11)
      .fillColor('#6B7280')
      .font('Helvetica-Bold')
      .text('TOTAL', 50, yPosition);

    doc
      .fontSize(20)
      .fillColor('#111827')
      .text(`$${finalAmount.toFixed(2)}`, 480, yPosition - 3, {
        align: 'right',
      });

    // Footer
    doc
      .fontSize(8)
      .fillColor('#9CA3AF')
      .font('Helvetica')
      .text('Thank you for your subscription', 50, 720, {
        align: 'center',
        width: 512,
      });

    doc.end();
    return doc;
  }
}
