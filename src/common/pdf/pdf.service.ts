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
  buildingCount: number;
  managerCount: number;
  buildingPrice: number;
  managerPrice: number;
  totalAmount: number;
  billingPeriod: {
    start: Date;
    end: Date;
  };
  proratedAmount?: number;
  action?: string;
}

@Injectable()
export class PdfService {
  generatePaymentInvoice(data: InvoiceData): PDFKit.PDFDocument {
    const doc = new PDFDocument({ margin: 50 });

    // Header
    doc
      .fontSize(20)
      .text('INVOICE', 50, 50, { align: 'right' })
      .fontSize(10)
      .text(`Invoice #: ${data.invoiceNumber}`, 50, 80, { align: 'right' })
      .text(`Date: ${data.date.toLocaleDateString()}`, 50, 95, {
        align: 'right',
      });

    if (data.dueDate) {
      doc.text(`Due Date: ${data.dueDate.toLocaleDateString()}`, 50, 110, {
        align: 'right',
      });
    }

    // Building Info
    doc.fontSize(16).text(data.buildingName, 50, 50).fontSize(10);

    if (data.buildingAddress) {
      doc.text(data.buildingAddress, 50, 75);
    }

    // Tenant Info
    doc
      .fontSize(12)
      .text('Bill To:', 50, 150)
      .fontSize(10)
      .text(data.tenantName, 50, 170)
      .text(data.tenantEmail, 50, 185);

    // Items Table Header
    const tableTop = 250;

    doc
      .fontSize(10)
      .text('Description', 50, tableTop)
      .text('Amount', 400, tableTop, { align: 'right' });

    doc
      .moveTo(50, tableTop + 15)
      .lineTo(550, tableTop + 15)
      .stroke();

    let yPosition = tableTop + 25;

    // Items
    data.items.forEach((item) => {
      doc
        .fontSize(10)
        .text(item.description, 50, yPosition)
        .text(`$${item.amount.toFixed(2)}`, 400, yPosition, { align: 'right' });
      yPosition += 20;
    });

    // Total
    doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();

    yPosition += 10;

    doc
      .fontSize(12)
      .text('Total:', 400, yPosition)
      .text(`$${data.total.toFixed(2)}`, 450, yPosition, { align: 'right' });

    if (data.status) {
      yPosition += 30;
      doc
        .fontSize(10)
        .text(`Status: ${data.status.toUpperCase()}`, 50, yPosition);
    }

    // Footer
    doc
      .fontSize(8)
      .text('Thank you for your payment!', 50, 700, { align: 'center' });

    doc.end();
    return doc;
  }

  generateSubscriptionInvoice(
    data: SubscriptionInvoiceData,
  ): PDFKit.PDFDocument {
    const doc = new PDFDocument({ margin: 50 });

    // Header
    doc
      .fontSize(20)
      .text('SUBSCRIPTION INVOICE', 50, 50, { align: 'right' })
      .fontSize(10)
      .text(`Invoice #: ${data.invoiceNumber}`, 50, 80, { align: 'right' })
      .text(`Date: ${data.date.toLocaleDateString()}`, 50, 95, {
        align: 'right',
      });

    // Company Info
    doc.fontSize(16).text('Building Management System', 50, 50).fontSize(10);

    // User Info
    doc
      .fontSize(12)
      .text('Bill To:', 50, 150)
      .fontSize(10)
      .text(data.userName, 50, 170)
      .text(data.userEmail, 50, 185);

    // Plan Details
    const tableTop = 250;

    doc.fontSize(12).text(`Plan: ${data.planName}`, 50, tableTop);

    if (data.action) {
      doc.text(`Action: ${data.action}`, 50, tableTop + 20);
    }

    doc
      .fontSize(10)
      .text(
        `Billing Period: ${data.billingPeriod.start.toLocaleDateString()} - ${data.billingPeriod.end.toLocaleDateString()}`,
        50,
        tableTop + 40,
      );

    // Items Table Header
    const itemsTop = tableTop + 80;

    doc
      .fontSize(10)
      .text('Description', 50, itemsTop)
      .text('Quantity', 350, itemsTop)
      .text('Price', 450, itemsTop, { align: 'right' });

    doc
      .moveTo(50, itemsTop + 15)
      .lineTo(550, itemsTop + 15)
      .stroke();

    let yPosition = itemsTop + 25;

    // Buildings
    doc
      .fontSize(10)
      .text('Buildings', 50, yPosition)
      .text(data.buildingCount.toString(), 350, yPosition)
      .text(`$${data.buildingPrice.toFixed(2)}`, 450, yPosition, {
        align: 'right',
      });

    yPosition += 20;

    // Managers
    doc
      .text('Managers', 50, yPosition)
      .text(data.managerCount.toString(), 350, yPosition)
      .text(`$${data.managerPrice.toFixed(2)}`, 450, yPosition, {
        align: 'right',
      });

    yPosition += 20;

    // Subtotal
    doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();

    yPosition += 10;

    const subtotal =
      data.buildingCount * data.buildingPrice +
      data.managerCount * data.managerPrice;

    doc
      .fontSize(10)
      .text('Subtotal:', 400, yPosition)
      .text(`$${subtotal.toFixed(2)}`, 450, yPosition, { align: 'right' });

    yPosition += 20;

    // Prorated amount if exists
    if (data.proratedAmount !== undefined && data.proratedAmount !== subtotal) {
      doc
        .text('Prorated Amount:', 400, yPosition)
        .text(`$${data.proratedAmount.toFixed(2)}`, 450, yPosition, {
          align: 'right',
        });
      yPosition += 20;
    }

    // Total
    doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();

    yPosition += 10;

    const finalAmount =
      data.proratedAmount !== undefined
        ? data.proratedAmount
        : data.totalAmount;

    doc
      .fontSize(12)
      .text('Total:', 400, yPosition)
      .text(`$${finalAmount.toFixed(2)}`, 450, yPosition, { align: 'right' });

    // Footer
    doc
      .fontSize(8)
      .text('Thank you for your subscription!', 50, 700, { align: 'center' });

    doc.end();
    return doc;
  }
}
