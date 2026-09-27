import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { ConfigService } from '@nestjs/config';

export function formatEtb(amount: number): string {
  return `ETB ${Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Addis_Ababa',
  });
}

type EmailMessage = Parameters<Resend['emails']['send']>[0];

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend;
  private readonly fromAddress: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.resend = new Resend(apiKey);
    // Must be an address on a domain verified in Resend, otherwise Resend
    // only delivers to the account owner's own email. Configured via EMAIL_FROM.
    this.fromAddress =
      this.configService.get<string>('EMAIL_FROM') ??
      'BMS <onboarding@resend.dev>';
  }

  /**
   * Email is best-effort: a delivery failure is logged but never fails the
   * business operation that triggered it (which has usually committed).
   */
  private async send(message: EmailMessage): Promise<void> {
    try {
      const { error } = await this.resend.emails.send(message);
      if (error) {
        this.logger.warn(
          `Email to ${String(message.to)} failed: ${error.message}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Email to ${String(message.to)} failed`,
        error as Error,
      );
    }
  }

  // User/Owner Auth
  async sendUserRegistrationEmail(email: string, name: string) {
    await this.send({
      from: this.fromAddress,
      to: email,
      subject: 'Welcome to Building Management System',
      html: `
        <h1>Welcome ${name}!</h1>
        <p>Thank you for registering with Building Management System.</p>
        <p>You can now log in and start managing your buildings.</p>
      `,
    });
  }

  async sendAccountDeletionScheduledEmail(
    email: string,
    name: string,
    purgeDate: Date,
  ) {
    await this.send({
      from: this.fromAddress,
      to: email,
      subject: 'Your account is scheduled for deletion',
      html: `
        <h1>Account Deletion Scheduled</h1>
        <p>Hi ${name},</p>
        <p>Your Building Management System account has been scheduled for deletion.</p>
        <p>All your buildings, tenants, leases and related data are no longer accessible.</p>
        <p><strong>Your account and all its data will be permanently deleted on ${formatDate(purgeDate)}.</strong></p>
        <p>If this was a mistake or you change your mind, contact support before that date to restore your account.</p>
      `,
    });
  }

  async sendAccountRestoredEmail(email: string, name: string) {
    await this.send({
      from: this.fromAddress,
      to: email,
      subject: 'Your account has been restored',
      html: `
        <h1>Account Restored</h1>
        <p>Hi ${name},</p>
        <p>Your Building Management System account has been restored. Your buildings, tenants and leases are available again.</p>
        <p>You can log in as usual.</p>
      `,
    });
  }

  async sendUserPasswordResetEmail(email: string, resetToken: string) {
    await this.send({
      from: this.fromAddress,
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
    console.log('Temporary password', temporaryPassword);
    await this.send({
      from: this.fromAddress,
      to: email,
      subject: 'You have Been Invited as a Building Manager',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <!-- Header -->
          <div style="border-bottom: 3px solid #3B82F6; padding-bottom: 20px; margin-bottom: 30px;">
            <h1 style="color: #111827; font-size: 28px; font-weight: 600; margin: 0;">
              Welcome to the Team
            </h1>
          </div>

          <!-- Greeting -->
          <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">
            Hi ${name},
          </p>

          <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
            You've been invited to join as a <strong>Building Manager</strong>. Your account has been created and is ready to use.
          </p>

          <!-- Login Credentials Box -->
          <div style="background-color: #F3F4F6; border-left: 4px solid #3B82F6; border-radius: 6px; padding: 24px; margin-bottom: 30px;">
            <h2 style="color: #111827; font-size: 16px; font-weight: 600; margin: 0 0 16px 0;">
              Your Login Credentials
            </h2>
            <div style="margin-bottom: 12px;">
              <span style="color: #6B7280; font-size: 14px; display: block; margin-bottom: 4px;">Email</span>
              <span style="color: #111827; font-size: 16px; font-weight: 500;">${email}</span>
            </div>
            <div>
              <span style="color: #6B7280; font-size: 14px; display: block; margin-bottom: 4px;">Temporary Password</span>
              <code style="background-color: #FFFFFF; color: #111827; padding: 8px 12px; border-radius: 4px; font-size: 16px; font-family: 'Courier New', monospace; display: inline-block;">${temporaryPassword}</code>
            </div>
          </div>

          <!-- Login Button -->
          <div style="text-align: center; margin: 40px 0;">
            <a href="${this.configService.get('FRONTEND_URL')}/login?type=manager" 
               style="background-color: #3B82F6; color: #FFFFFF; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600; display: inline-block;">
              Login to Your Account
            </a>
          </div>

          <!-- Security Notice -->
          <div style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; border-radius: 6px; padding: 16px; margin-bottom: 30px;">
            <p style="color: #92400E; font-size: 14px; margin: 0; line-height: 1.5;">
              <strong>Important:</strong> Please change your password immediately after your first login for security purposes.
            </p>
          </div>

          <!-- Footer -->
          <div style="border-top: 1px solid #E5E7EB; padding-top: 24px; margin-top: 40px;">
            <p style="color: #9CA3AF; font-size: 14px; line-height: 1.6; margin: 0;">
              Need help? Contact us at <a href="mailto:support@bms.com" style="color: #3B82F6; text-decoration: none;">support@bms.com</a>
            </p>
            <p style="color: #9CA3AF; font-size: 12px; margin-top: 12px;">
              Building Management System
            </p>
          </div>
        </div>
      `,
    });
  }

  async sendManagerPasswordResetEmail(email: string, resetToken: string) {
    await this.send({
      from: this.fromAddress,
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
    temporaryPassword: string,
  ) {
    console.log('Temporary password', temporaryPassword);

    const loginUrl = `${this.configService.get('FRONTEND_URL')}/login?type=tenant`;
    await this.send({
      from: this.fromAddress,
      to: email,
      subject: 'Welcome to Your Tenant Portal',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <div style="border-bottom: 3px solid #3B82F6; padding-bottom: 20px; margin-bottom: 30px;">
            <h1 style="color: #111827; font-size: 28px; font-weight: 600; margin: 0;">Welcome to Your Tenant Portal</h1>
          </div>
          <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 20px;">Hi ${name},</p>
          <p style="color: #374151; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
            Your tenant account has been created for <strong>${buildingName}</strong>. You can log in with the credentials below.
          </p>
          <div style="background-color: #F3F4F6; border-left: 4px solid #3B82F6; border-radius: 6px; padding: 24px; margin-bottom: 30px;">
            <h2 style="color: #111827; font-size: 16px; font-weight: 600; margin: 0 0 16px 0;">Your Login Credentials</h2>
            <div style="margin-bottom: 12px;">
              <span style="color: #6B7280; font-size: 14px; display: block; margin-bottom: 4px;">Email</span>
              <span style="color: #111827; font-size: 16px; font-weight: 500;">${email}</span>
            </div>
            <div>
              <span style="color: #6B7280; font-size: 14px; display: block; margin-bottom: 4px;">Temporary Password</span>
              <code style="background-color: #FFFFFF; color: #111827; padding: 8px 12px; border-radius: 4px; font-size: 16px; font-family: 'Courier New', monospace; display: inline-block;">${temporaryPassword}</code>
            </div>
          </div>
          <div style="text-align: center; margin: 40px 0;">
            <a href="${loginUrl}" style="background-color: #3B82F6; color: #FFFFFF; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 16px; font-weight: 600; display: inline-block;">Log in to Tenant Portal</a>
          </div>
          <div style="background-color: #FEF3C7; border-left: 4px solid #F59E0B; border-radius: 6px; padding: 16px; margin-bottom: 30px;">
            <p style="color: #92400E; font-size: 14px; margin: 0; line-height: 1.5;">
              <strong>Important:</strong> Please change your password after your first login for security.
            </p>
          </div>
          <div style="border-top: 1px solid #E5E7EB; padding-top: 24px; margin-top: 40px;">
            <p style="color: #9CA3AF; font-size: 14px; line-height: 1.6; margin: 0;">Building Management System</p>
          </div>
        </div>
      `,
    });
  }

  async sendTenantPasswordResetEmail(email: string, otp: string) {
    await this.send({
      from: this.fromAddress,
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
    await this.send({
      from: this.fromAddress,
      to: email,
      subject: 'Subscription Activated',
      html: `
        <h1>Subscription Activated</h1>
        <p>Hi ${name},</p>
        <p>Your ${planName} subscription has been activated.</p>
        <p>Amount: ${formatEtb(amount)}</p>
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
    await this.send({
      from: this.fromAddress,
      to: email,
      subject: 'Subscription Updated',
      html: `
        <h1>Subscription Updated</h1>
        <p>Hi ${name},</p>
        <p>Your subscription has been changed from ${oldPlan} to ${newPlan}.</p>
        <p>New amount: ${formatEtb(amount)}</p>
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
    await this.send({
      from: this.fromAddress,
      to: email,
      subject: 'Subscription Expiring Soon',
      html: `
        <h1>Subscription Expiring Soon</h1>
        <p>Hi ${name},</p>
        <p>Your ${planName} subscription will expire on ${formatDate(expiryDate)}.</p>
        <p>Please renew to continue using the service.</p>
      `,
    });
  }

  async sendSubscriptionExpiredEmail(
    email: string,
    name: string,
    planName: string,
  ) {
    await this.send({
      from: this.fromAddress,
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
    await this.send({
      from: this.fromAddress,
      to: email,
      subject: 'New Lease Agreement',
      html: `
        <h1>Lease Agreement</h1>
        <p>Hi ${tenantName},</p>
        <p>Your lease for Unit ${unitNumber} has been created.</p>
        <p>Start Date: ${formatDate(startDate)}</p>
        <p>End Date: ${formatDate(endDate)}</p>
        <p>Monthly Rent: ${formatEtb(rentAmount)}</p>
      `,
    });
  }

  async sendLeaseExpiringEmail(
    email: string,
    tenantName: string,
    unitNumber: string,
    expiryDate: Date,
  ) {
    await this.send({
      from: this.fromAddress,
      to: email,
      subject: 'Lease Expiring Soon',
      html: `
        <h1>Lease Expiring Soon</h1>
        <p>Hi ${tenantName},</p>
        <p>Your lease for Unit ${unitNumber} will expire on ${formatDate(expiryDate)}.</p>
        <p>Please contact management for renewal.</p>
      `,
    });
  }

  async sendLeaseExpiredEmail(
    email: string,
    tenantName: string,
    unitNumber: string,
  ) {
    await this.send({
      from: this.fromAddress,
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
    await this.send({
      from: this.fromAddress,
      to: email,
      subject: 'Payment Receipt',
      html: `
        <h1>Payment Receipt</h1>
        <p>Hi ${tenantName},</p>
        <p>Your payment has been received.</p>
        <p>Amount: ${formatEtb(amount)}</p>
        <p>Date: ${formatDate(paymentDate)}</p>
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
    await this.send({
      from: this.fromAddress,
      to: email,
      subject: 'New Invoice',
      html: `
        <h1>New Invoice</h1>
        <p>Hi ${tenantName},</p>
        <p>A new invoice has been created.</p>
        <p>Invoice Number: ${invoiceNumber}</p>
        <p>Amount: ${formatEtb(amount)}</p>
        <p>Due Date: ${formatDate(dueDate)}</p>
      `,
    });
  }

  async sendRentOverdueEmail(
    email: string,
    tenantName: string,
    unitNumber: string,
    amount: number,
    periodLabels: string[],
  ) {
    await this.send({
      from: this.fromAddress,
      to: email,
      subject: 'Rent Overdue',
      html: `
        <h1>Rent Overdue</h1>
        <p>Hi ${tenantName},</p>
        <p>Rent for Unit ${unitNumber} is overdue for: ${periodLabels.join(', ')}.</p>
        <p>Amount due: ${formatEtb(amount)}</p>
        <p>Please pay as soon as possible, or upload your payment receipt in the tenant portal.</p>
      `,
    });
  }

  async sendRentDueReminderEmail(
    email: string,
    tenantName: string,
    unitNumber: string,
    amount: number,
    dueDate: Date,
  ) {
    await this.send({
      from: this.fromAddress,
      to: email,
      subject: 'Rent Due Soon',
      html: `
        <h1>Rent Due Soon</h1>
        <p>Hi ${tenantName},</p>
        <p>Your rent for Unit ${unitNumber} is due on ${formatDate(dueDate)}.</p>
        <p>Amount: ${formatEtb(amount)}</p>
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
    await this.send({
      from: this.fromAddress,
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
    await this.send({
      from: this.fromAddress,
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
    await this.send({
      from: this.fromAddress,
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
    await this.send({
      from: this.fromAddress,
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
    await this.send({
      from: this.fromAddress,
      to: email,
      subject: `Subscription Invoice - ${invoiceNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #8B5CF6;">Subscription Invoice</h1>
          <p>Hi ${name},</p>
          <p>Thank you for subscribing to the <strong>${planName}</strong> plan.</p>
          <p style="font-size: 18px; color: #111827;">Amount: <strong>${formatEtb(amount)}</strong></p>
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
    await this.send({
      from: this.fromAddress,
      to: email,
      subject: `Payment Receipt - ${invoiceNumber}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #3B82F6;">Payment Receipt</h1>
          <p>Hi ${tenantName},</p>
          <p>Thank you for your payment.</p>
          <div style="margin: 20px 0; padding: 20px; background-color: #EFF6FF; border-left: 4px solid #3B82F6; border-radius: 4px;">
            <p style="margin: 5px 0;"><strong>Invoice:</strong> ${invoiceNumber}</p>
            <p style="margin: 5px 0;"><strong>Amount:</strong> ${formatEtb(amount)}</p>
            <p style="margin: 5px 0;"><strong>Date:</strong> ${formatDate(paymentDate)}</p>
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
    await this.send({
      from: this.fromAddress,
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
            <p style="margin: 5px 0;"><strong>Prorated Amount:</strong> ${formatEtb(amount)}</p>
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

  async sendLeaseTerminatedEmail(
    email: string,
    tenantName: string,
    unitNumber: string,
    effectiveDate: Date,
    outstandingAmount: number,
  ) {
    await this.send({
      from: this.fromAddress,
      to: email,
      subject: 'Lease Terminated',
      html: `
        <h1>Lease Terminated</h1>
        <p>Hi ${tenantName},</p>
        <p>Your lease for Unit ${unitNumber} was terminated effective ${formatDate(effectiveDate)}.</p>
        ${
          outstandingAmount > 0
            ? `<p>Outstanding rent still owed: ${formatEtb(outstandingAmount)}</p>`
            : '<p>You have no outstanding rent on this lease.</p>'
        }
      `,
    });
  }

  async sendSubscriptionRequestReceivedEmail(
    email: string,
    name: string,
    planName: string,
    amount: number,
  ) {
    await this.send({
      from: this.fromAddress,
      to: email,
      subject: 'Plan request received',
      html: `
        <h1>We received your plan request</h1>
        <p>Hi ${name},</p>
        <p>Your request for the ${planName} plan (${formatEtb(amount)}) is being reviewed.
        We will activate it once your payment is verified.</p>
      `,
    });
  }

  async sendSubscriptionRequestReviewedEmail(
    email: string,
    name: string,
    planName: string,
    approved: boolean,
    reason?: string | null,
  ) {
    await this.send({
      from: this.fromAddress,
      to: email,
      subject: approved ? 'Your plan is active' : 'Plan request rejected',
      html: approved
        ? `
        <h1>Your ${planName} plan is active</h1>
        <p>Hi ${name},</p>
        <p>Your payment was verified and your ${planName} plan is now active.</p>
      `
        : `
        <h1>Plan request rejected</h1>
        <p>Hi ${name},</p>
        <p>Your request for the ${planName} plan was rejected.${reason ? ` Reason: ${reason}` : ''}</p>
        <p>You can submit a new request from the Subscription page.</p>
      `,
    });
  }

  async sendOwnerAccountCreatedEmail(
    email: string,
    name: string,
    temporaryPassword: string,
  ) {
    const loginUrl =
      this.configService.get<string>('FRONTEND_URL') ??
      'http://localhost:3000/login';
    await this.send({
      from: this.fromAddress,
      to: email,
      subject: 'Your Building Management account',
      html: `
        <h1>Welcome ${name}!</h1>
        <p>An account was created for you on Building Management System.</p>
        <p>Email: ${email}<br/>Temporary password: <strong>${temporaryPassword}</strong></p>
        <p>You will be asked to choose a new password when you first sign in at
        <a href="${loginUrl}">${loginUrl}</a>.</p>
        <p>Your account includes a free trial.</p>
      `,
    });
  }

  async sendPlanRequestToAdminsEmail(
    emails: string[],
    ownerName: string,
    planName: string,
    amount: number,
  ) {
    if (emails.length === 0) return;
    await this.send({
      from: this.fromAddress,
      to: emails,
      subject: `New plan request: ${ownerName} → ${planName}`,
      html: `
        <h1>New plan request</h1>
        <p>${ownerName} requested the ${planName} plan and uploaded a bank receipt for ${formatEtb(amount)}.</p>
        <p>Check the payment and approve or reject it under Plan Requests in the admin panel.</p>
      `,
    });
  }
}
