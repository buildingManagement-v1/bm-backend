import { Injectable } from '@nestjs/common';
import { Resend } from 'resend';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private resend: Resend;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.resend = new Resend(apiKey);
  }

  // User/Owner Auth
  async sendUserRegistrationEmail(email: string, name: string) {
    await this.resend.emails.send({
      from: 'BMS <onboarding@resend.dev>',
      to: email,
      subject: 'Welcome to Building Management System',
      html: `
        <h1>Welcome ${name}!</h1>
        <p>Thank you for registering with Building Management System.</p>
        <p>You can now log in and start managing your buildings.</p>
      `,
    });
  }

  async sendUserPasswordResetEmail(email: string, resetToken: string) {
    await this.resend.emails.send({
      from: 'BMS <onboarding@resend.dev>',
      to: email,
      subject: 'Password Reset Request',
      html: `
        <h1>Password Reset</h1>
        <p>You requested to reset your password.</p>
        <p>Your reset code is: <strong>${resetToken}</strong></p>
        <p>This code will expire in 10 minutes.</p>
      `,
    });
  }

  // Manager Auth
  async sendManagerCreatedEmail(
    email: string,
    name: string,
    temporaryPassword: string,
  ) {
    await this.resend.emails.send({
      from: 'BMS <onboarding@resend.dev>',
      to: email,
      subject: 'Your Manager Account Has Been Created',
      html: `
        <h1>Welcome ${name}!</h1>
        <p>A manager account has been created for you.</p>
        <p>Temporary Password: <strong>${temporaryPassword}</strong></p>
        <p>Please log in and change your password immediately.</p>
      `,
    });
  }

  async sendManagerPasswordResetEmail(email: string, resetToken: string) {
    await this.resend.emails.send({
      from: 'BMS <onboarding@resend.dev>',
      to: email,
      subject: 'Manager Password Reset',
      html: `
        <h1>Password Reset</h1>
        <p>Your reset code is: <strong>${resetToken}</strong></p>
        <p>This code will expire in 10 minutes.</p>
      `,
    });
  }

  // Tenant Auth
  async sendTenantCreatedEmail(
    email: string,
    name: string,
    buildingName: string,
  ) {
    await this.resend.emails.send({
      from: 'BMS <onboarding@resend.dev>',
      to: email,
      subject: 'Welcome to Your Tenant Portal',
      html: `
        <h1>Welcome ${name}!</h1>
        <p>Your tenant account has been created for ${buildingName}.</p>
        <p>You can now log in to access your tenant portal.</p>
      `,
    });
  }

  async sendTenantPasswordResetEmail(email: string, otp: string) {
    await this.resend.emails.send({
      from: 'BMS <onboarding@resend.dev>',
      to: email,
      subject: 'Tenant Password Reset',
      html: `
        <h1>Password Reset</h1>
        <p>Your OTP code is: <strong>${otp}</strong></p>
        <p>This code will expire in 10 minutes.</p>
      `,
    });
  }

  // Subscription Management
  async sendSubscriptionCreatedEmail(
    email: string,
    name: string,
    planName: string,
    amount: number,
    invoiceLink?: string,
  ) {
    await this.resend.emails.send({
      from: 'BMS <onboarding@resend.dev>',
      to: email,
      subject: 'Subscription Activated',
      html: `
        <h1>Subscription Activated</h1>
        <p>Hi ${name},</p>
        <p>Your ${planName} subscription has been activated.</p>
        <p>Amount: $${amount.toFixed(2)}</p>
        ${invoiceLink ? `<p><a href="${invoiceLink}">Download Invoice</a></p>` : ''}
      `,
    });
  }

  async sendSubscriptionUpgradedEmail(
    email: string,
    name: string,
    oldPlan: string,
    newPlan: string,
    amount: number,
    invoiceLink?: string,
  ) {
    await this.resend.emails.send({
      from: 'BMS <onboarding@resend.dev>',
      to: email,
      subject: 'Subscription Updated',
      html: `
        <h1>Subscription Updated</h1>
        <p>Hi ${name},</p>
        <p>Your subscription has been changed from ${oldPlan} to ${newPlan}.</p>
        <p>New amount: $${amount.toFixed(2)}</p>
        ${invoiceLink ? `<p><a href="${invoiceLink}">Download Invoice</a></p>` : ''}
      `,
    });
  }

  async sendSubscriptionExpiringEmail(
    email: string,
    name: string,
    planName: string,
    expiryDate: Date,
  ) {
    await this.resend.emails.send({
      from: 'BMS <onboarding@resend.dev>',
      to: email,
      subject: 'Subscription Expiring Soon',
      html: `
        <h1>Subscription Expiring Soon</h1>
        <p>Hi ${name},</p>
        <p>Your ${planName} subscription will expire on ${expiryDate.toLocaleDateString()}.</p>
        <p>Please renew to continue using the service.</p>
      `,
    });
  }

  async sendSubscriptionExpiredEmail(
    email: string,
    name: string,
    planName: string,
  ) {
    await this.resend.emails.send({
      from: 'BMS <onboarding@resend.dev>',
      to: email,
      subject: 'Subscription Expired',
      html: `
        <h1>Subscription Expired</h1>
        <p>Hi ${name},</p>
        <p>Your ${planName} subscription has expired.</p>
        <p>Please renew to regain access.</p>
      `,
    });
  }

  // Lease Management
  async sendLeaseCreatedEmail(
    email: string,
    tenantName: string,
    unitNumber: string,
    startDate: Date,
    endDate: Date,
    rentAmount: number,
  ) {
    await this.resend.emails.send({
      from: 'BMS <onboarding@resend.dev>',
      to: email,
      subject: 'New Lease Agreement',
      html: `
        <h1>Lease Agreement</h1>
        <p>Hi ${tenantName},</p>
        <p>Your lease for Unit ${unitNumber} has been created.</p>
        <p>Start Date: ${startDate.toLocaleDateString()}</p>
        <p>End Date: ${endDate.toLocaleDateString()}</p>
        <p>Monthly Rent: $${rentAmount.toFixed(2)}</p>
      `,
    });
  }

  async sendLeaseExpiringEmail(
    email: string,
    tenantName: string,
    unitNumber: string,
    expiryDate: Date,
  ) {
    await this.resend.emails.send({
      from: 'BMS <onboarding@resend.dev>',
      to: email,
      subject: 'Lease Expiring Soon',
      html: `
        <h1>Lease Expiring Soon</h1>
        <p>Hi ${tenantName},</p>
        <p>Your lease for Unit ${unitNumber} will expire on ${expiryDate.toLocaleDateString()}.</p>
        <p>Please contact management for renewal.</p>
      `,
    });
  }

  async sendLeaseExpiredEmail(
    email: string,
    tenantName: string,
    unitNumber: string,
  ) {
    await this.resend.emails.send({
      from: 'BMS <onboarding@resend.dev>',
      to: email,
      subject: 'Lease Expired',
      html: `
        <h1>Lease Expired</h1>
        <p>Hi ${tenantName},</p>
        <p>Your lease for Unit ${unitNumber} has expired.</p>
      `,
    });
  }

  // Payment & Invoice
  async sendPaymentReceiptEmail(
    email: string,
    tenantName: string,
    amount: number,
    paymentDate: Date,
    invoiceNumber: string,
  ) {
    await this.resend.emails.send({
      from: 'BMS <onboarding@resend.dev>',
      to: email,
      subject: 'Payment Receipt',
      html: `
        <h1>Payment Receipt</h1>
        <p>Hi ${tenantName},</p>
        <p>Your payment has been received.</p>
        <p>Amount: $${amount.toFixed(2)}</p>
        <p>Date: ${paymentDate.toLocaleDateString()}</p>
        <p>Invoice: ${invoiceNumber}</p>
      `,
    });
  }

  async sendInvoiceCreatedEmail(
    email: string,
    tenantName: string,
    invoiceNumber: string,
    amount: number,
    dueDate: Date,
  ) {
    await this.resend.emails.send({
      from: 'BMS <onboarding@resend.dev>',
      to: email,
      subject: 'New Invoice',
      html: `
        <h1>New Invoice</h1>
        <p>Hi ${tenantName},</p>
        <p>A new invoice has been created.</p>
        <p>Invoice Number: ${invoiceNumber}</p>
        <p>Amount: $${amount.toFixed(2)}</p>
        <p>Due Date: ${dueDate.toLocaleDateString()}</p>
      `,
    });
  }

  async sendPaymentOverdueEmail(
    email: string,
    tenantName: string,
    invoiceNumber: string,
    amount: number,
    dueDate: Date,
  ) {
    await this.resend.emails.send({
      from: 'BMS <onboarding@resend.dev>',
      to: email,
      subject: 'Payment Overdue',
      html: `
        <h1>Payment Overdue</h1>
        <p>Hi ${tenantName},</p>
        <p>Your payment is overdue.</p>
        <p>Invoice: ${invoiceNumber}</p>
        <p>Amount: $${amount.toFixed(2)}</p>
        <p>Due Date: ${dueDate.toLocaleDateString()}</p>
        <p>Please make payment as soon as possible.</p>
      `,
    });
  }

  async sendPaymentReminderEmail(
    email: string,
    tenantName: string,
    invoiceNumber: string,
    amount: number,
    dueDate: Date,
  ) {
    await this.resend.emails.send({
      from: 'BMS <onboarding@resend.dev>',
      to: email,
      subject: 'Payment Reminder',
      html: `
        <h1>Payment Reminder</h1>
        <p>Hi ${tenantName},</p>
        <p>This is a reminder about your upcoming payment.</p>
        <p>Invoice: ${invoiceNumber}</p>
        <p>Amount: $${amount.toFixed(2)}</p>
        <p>Due Date: ${dueDate.toLocaleDateString()}</p>
      `,
    });
  }

  // Maintenance Requests
  async sendMaintenanceRequestCreatedEmail(
    ownerEmail: string,
    ownerName: string,
    tenantName: string,
    unitNumber: string,
    title: string,
    priority: string,
  ) {
    await this.resend.emails.send({
      from: 'BMS <onboarding@resend.dev>',
      to: ownerEmail,
      subject: 'New Maintenance Request',
      html: `
        <h1>New Maintenance Request</h1>
        <p>Hi ${ownerName},</p>
        <p>A new maintenance request has been submitted.</p>
        <p>Tenant: ${tenantName}</p>
        <p>Unit: ${unitNumber}</p>
        <p>Issue: ${title}</p>
        <p>Priority: ${priority}</p>
      `,
    });
  }

  async sendMaintenanceStatusUpdateEmail(
    tenantEmail: string,
    tenantName: string,
    title: string,
    status: string,
  ) {
    await this.resend.emails.send({
      from: 'BMS <onboarding@resend.dev>',
      to: tenantEmail,
      subject: 'Maintenance Request Update',
      html: `
        <h1>Maintenance Request Update</h1>
        <p>Hi ${tenantName},</p>
        <p>Your maintenance request has been updated.</p>
        <p>Issue: ${title}</p>
        <p>Status: ${status}</p>
      `,
    });
  }

  // Platform Admin Auth
  async sendPlatformAdminCreatedEmail(
    email: string,
    name: string,
    temporaryPassword: string,
  ) {
    await this.resend.emails.send({
      from: 'BMS <onboarding@resend.dev>',
      to: email,
      subject: 'Platform Admin Account Created',
      html: `
      <h1>Welcome ${name}!</h1>
      <p>Your platform admin account has been created.</p>
      <p>Temporary Password: <strong>${temporaryPassword}</strong></p>
      <p>Please log in and change your password immediately.</p>
    `,
    });
  }

  async sendPlatformAdminPasswordResetEmail(email: string, otp: string) {
    await this.resend.emails.send({
      from: 'BMS <onboarding@resend.dev>',
      to: email,
      subject: 'Platform Admin Password Reset',
      html: `
      <h1>Password Reset</h1>
      <p>Your OTP code is: <strong>${otp}</strong></p>
      <p>This code will expire in 10 minutes.</p>
    `,
    });
  }

  async sendSubscriptionInvoiceEmail(
    email: string,
    name: string,
    planName: string,
    amount: number,
    invoiceNumber: string,
    pdfBuffer: Buffer,
  ) {
    await this.resend.emails.send({
      from: 'BMS <onboarding@resend.dev>',
      to: email,
      subject: `Subscription Invoice - ${invoiceNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #8B5CF6;">Subscription Invoice</h1>
          <p>Hi ${name},</p>
          <p>Thank you for subscribing to the <strong>${planName}</strong> plan.</p>
          <p style="font-size: 18px; color: #111827;">Amount: <strong>$${amount.toFixed(2)}</strong></p>
          <p>Your invoice is attached to this email.</p>
          <div style="margin-top: 30px; padding: 20px; background-color: #F3F4F6; border-radius: 8px;">
            <p style="margin: 0; color: #6B7280; font-size: 14px;">
              Need help? Contact us at support@bms.com
            </p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `${invoiceNumber}.pdf`,
          content: pdfBuffer,
        },
      ],
    });
  }

  async sendPaymentInvoiceEmail(
    email: string,
    tenantName: string,
    amount: number,
    paymentDate: Date,
    invoiceNumber: string,
    pdfBuffer: Buffer,
  ) {
    await this.resend.emails.send({
      from: 'BMS <onboarding@resend.dev>',
      to: email,
      subject: `Payment Receipt - ${invoiceNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #3B82F6;">Payment Receipt</h1>
          <p>Hi ${tenantName},</p>
          <p>Thank you for your payment.</p>
          <div style="margin: 20px 0; padding: 20px; background-color: #EFF6FF; border-left: 4px solid #3B82F6; border-radius: 4px;">
            <p style="margin: 5px 0;"><strong>Invoice:</strong> ${invoiceNumber}</p>
            <p style="margin: 5px 0;"><strong>Amount:</strong> $${amount.toFixed(2)}</p>
            <p style="margin: 5px 0;"><strong>Date:</strong> ${paymentDate.toLocaleDateString()}</p>
          </div>
          <p>Your receipt is attached to this email.</p>
          <div style="margin-top: 30px; padding: 20px; background-color: #F3F4F6; border-radius: 8px;">
            <p style="margin: 0; color: #6B7280; font-size: 14px;">
              Questions? Contact us at support@bms.com
            </p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `${invoiceNumber}.pdf`,
          content: pdfBuffer,
        },
      ],
    });
  }

  async sendUpgradeInvoiceEmail(
    email: string,
    name: string,
    oldPlan: string,
    newPlan: string,
    amount: number,
    invoiceNumber: string,
    pdfBuffer: Buffer,
  ) {
    await this.resend.emails.send({
      from: 'BMS <onboarding@resend.dev>',
      to: email,
      subject: `Subscription Upgrade Invoice - ${invoiceNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #8B5CF6;">Subscription Upgraded</h1>
          <p>Hi ${name},</p>
          <p>Your subscription has been successfully upgraded!</p>
          <div style="margin: 20px 0; padding: 20px; background-color: #F5F3FF; border-left: 4px solid #8B5CF6; border-radius: 4px;">
            <p style="margin: 5px 0;"><strong>Previous Plan:</strong> ${oldPlan}</p>
            <p style="margin: 5px 0;"><strong>New Plan:</strong> ${newPlan}</p>
            <p style="margin: 5px 0;"><strong>Prorated Amount:</strong> $${amount.toFixed(2)}</p>
          </div>
          <p>Your upgrade invoice is attached to this email.</p>
          <div style="margin-top: 30px; padding: 20px; background-color: #F3F4F6; border-radius: 8px;">
            <p style="margin: 0; color: #6B7280; font-size: 14px;">
              Need help? Contact us at support@bms.com
            </p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `${invoiceNumber}.pdf`,
          content: pdfBuffer,
        },
      ],
    });
  }
}
