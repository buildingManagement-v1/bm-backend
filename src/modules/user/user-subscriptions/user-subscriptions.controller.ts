import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  ParseUUIDPipe,
  NotFoundException,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { StorageEngine } from 'multer';
import multer from 'multer';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { User } from '../../../common/decorators/user.decorator';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { OwnerGuard } from 'src/common/guards/user-type.guards';
import {
  BillingService,
  FREE_TRIAL_MONTHS,
  isFreePlan,
} from 'src/modules/billing/billing.service';
import { CreateSubscriptionRequestDto } from 'src/modules/billing/dto';
import { streamUpload } from 'src/common/uploads/uploads.util';
import { PrismaService } from 'src/prisma/prisma.service';
import { SettingsService } from 'src/modules/platform-admin/settings/settings.service';

@ApiTags('User Subscriptions')
@ApiBearerAuth()
@Controller('v1/app/subscriptions')
@UseGuards(JwtAuthGuard, OwnerGuard)
export class UserSubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly billingService: BillingService,
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  @Get('my-subscription')
  @ApiOperation({
    summary: 'Get my current subscription, usage and billing state',
  })
  @ApiResponse({
    status: 200,
    description: 'Return user active subscription and usage stats',
  })
  async getMySubscription(@User() user: { id: string }) {
    const [active, usage, trialUsed, requests, latest, contact] =
      await Promise.all([
        this.billingService.activeSubscription(user.id),
        this.subscriptionsService.getUsageForUser(user.id),
        this.billingService.hasUsedTrial(user.id),
        this.billingService.listMine(user.id),
        this.prisma.subscription.findFirst({
          where: { userId: user.id },
          orderBy: { billingCycleEnd: 'desc' },
          include: { plan: true },
        }),
        this.settingsService.publicValues(),
      ]);

    return {
      success: true,
      data: active,
      usage,
      support: { email: contact.supportEmail, phone: contact.supportPhone },
      billing: {
        trialUsed,
        isTrial: !!active && isFreePlan(active.plan),
        // Set when there is no active plan: the account is read-only
        expiredSubscription: active ? null : latest,
        pendingRequest: requests.find((r) => r.status === 'pending') ?? null,
      },
    };
  }

  @Get('available-plans')
  @ApiOperation({
    summary: 'Plans I can buy (public plans and my current plan)',
  })
  async getAvailablePlans(@User() user: { id: string }) {
    return {
      success: true,
      data: await this.billingService.availablePlans(user.id),
    };
  }

  @Get('quote')
  @ApiOperation({
    summary: 'Price and effect of buying, renewing or switching to a plan',
  })
  async quote(
    @User() user: { id: string },
    @Query('planId', new ParseUUIDPipe()) planId: string,
  ) {
    return {
      success: true,
      data: await this.billingService.quote(user.id, planId),
    };
  }

  @Post('requests')
  @UseInterceptors(
    FileInterceptor('receipt', {
      limits: { fileSize: 5 * 1024 * 1024 },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- multer default export typings unresolved
      storage: (
        multer as { memoryStorage: () => StorageEngine }
      ).memoryStorage(),
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Request a plan (with bank-transfer receipt); activated once a billing admin approves it',
  })
  @ApiResponse({ status: 201, description: 'Request submitted for review' })
  async createRequest(
    @User() user: { id: string },
    @Body() dto: CreateSubscriptionRequestDto,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ) {
    const data = await this.billingService.createRequest(user.id, dto, file);
    return {
      success: true,
      data,
      message:
        'Request submitted. Your plan will be activated once payment is verified.',
    };
  }

  @Get('requests')
  @ApiOperation({ summary: 'My plan requests' })
  async listRequests(@User() user: { id: string }) {
    return { success: true, data: await this.billingService.listMine(user.id) };
  }

  @Post('requests/:id/cancel')
  @ApiOperation({ summary: 'Cancel my pending plan request' })
  async cancelRequest(
    @User() user: { id: string },
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return {
      success: true,
      data: await this.billingService.cancel(user.id, id),
    };
  }

  @Get('requests/:id/receipt')
  @ApiOperation({ summary: 'View the receipt I uploaded' })
  async requestReceipt(
    @User() user: { id: string },
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return streamUpload(await this.billingService.receiptFor(id, user.id));
  }

  @Get(':id/invoice')
  @ApiOperation({ summary: 'Download the invoice for one of my subscriptions' })
  async invoice(
    @User() user: { id: string },
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res() res: Response,
  ) {
    const owned = await this.prisma.subscription.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    });
    if (!owned) {
      throw new NotFoundException('Subscription not found');
    }
    const pdfDoc = await this.subscriptionsService.downloadInvoice(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=subscription-${id}.pdf`,
    );
    pdfDoc.pipe(res);
  }

  @Post('subscribe-free')
  @ApiOperation({
    summary: `Start the one-time ${FREE_TRIAL_MONTHS}-month Free trial`,
  })
  @ApiResponse({ status: 201, description: 'Trial started' })
  async subscribeFree(@User() user: { id: string }) {
    if (await this.billingService.activeSubscription(user.id)) {
      throw new BadRequestException('You already have an active subscription');
    }
    if (await this.billingService.hasUsedTrial(user.id)) {
      throw new BadRequestException(
        'The free trial has already been used. Choose a plan to continue.',
      );
    }
    const data = await this.billingService.startTrial(user.id);
    return { success: true, data, message: 'Free trial started' };
  }
}
