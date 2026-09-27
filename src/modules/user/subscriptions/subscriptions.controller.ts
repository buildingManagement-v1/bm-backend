import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Patch,
  Param,
  UseGuards,
  Res,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ExtendSubscriptionDto } from './dto/extend-subscription.dto';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto, UpdateSubscriptionDto } from './dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { User } from '../../../common/decorators/user.decorator';
import { UpgradeSubscriptionDto } from './dto/upgrade-subscription.dto';
import type { Response } from 'express';

@ApiTags('Platform Subscriptions')
@ApiBearerAuth()
@Controller('v1/platform/subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'billing_manager')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a subscription' })
  @ApiResponse({
    status: 201,
    description: 'Subscription created successfully',
  })
  async create(
    @Body() createSubscriptionDto: CreateSubscriptionDto,
    @User() admin: { id: string; email: string },
  ) {
    return await this.subscriptionsService.create(
      createSubscriptionDto,
      admin.id,
      await this.adminName(admin.id),
    );
  }

  @Get('all')
  @ApiOperation({ summary: 'Get all subscriptions' })
  @ApiResponse({ status: 200, description: 'Return all subscriptions' })
  async findAll(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return await this.subscriptionsService.findAllSubscriptions({
      status,
      q,
      limit: Math.min(100, Math.max(1, Number(limit) || 20)),
      offset: Math.max(0, Number(offset) || 0),
    });
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get all subscriptions by user ID' })
  @ApiResponse({ status: 200, description: 'Return subscriptions for user' })
  async findAllByUser(@Param('userId') userId: string) {
    return await this.subscriptionsService.findAll(userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a subscription by ID' })
  @ApiResponse({ status: 200, description: 'Return subscription details' })
  async findOne(@Param('id') id: string) {
    return await this.subscriptionsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a subscription' })
  @ApiResponse({
    status: 200,
    description: 'Subscription updated successfully',
  })
  async update(
    @Param('id') id: string,
    @Body() updateSubscriptionDto: UpdateSubscriptionDto,
    @User() admin: { id: string; email: string },
  ) {
    return await this.subscriptionsService.update(
      id,
      updateSubscriptionDto,
      admin.id,
      await this.adminName(admin.id),
    );
  }

  @Post(':id/upgrade')
  @ApiOperation({ summary: 'Upgrade a subscription' })
  @ApiResponse({
    status: 200,
    description: 'Subscription upgraded successfully',
  })
  async upgrade(
    @Param('id') id: string,
    @Body() upgradeDto: UpgradeSubscriptionDto,
    @User() admin: { id: string; email: string },
  ) {
    return await this.subscriptionsService.upgrade(
      id,
      upgradeDto.newPlanId,
      admin.id,
      await this.adminName(admin.id),
    );
  }

  @Post(':id/calculate-upgrade')
  @ApiOperation({ summary: 'Calculate upgrade prorating' })
  @ApiResponse({ status: 200, description: 'Return prorated calculation' })
  async calculateUpgrade(
    @Param('id') id: string,
    @Body() dto: UpgradeSubscriptionDto,
  ) {
    return await this.subscriptionsService.calculateUpgradeProrating(
      id,
      dto.newPlanId,
    );
  }

  @Post(':id/extend')
  @ApiOperation({ summary: 'Extend the cycle (offline renewal or credit)' })
  async extend(
    @Param('id') id: string,
    @Body() dto: ExtendSubscriptionDto,
    @User() admin: { id: string },
  ) {
    return await this.subscriptionsService.extend(
      id,
      dto.months,
      dto.reason,
      admin.id,
      await this.adminName(admin.id),
    );
  }

  private async adminName(id: string): Promise<string> {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id },
      select: { name: true },
    });
    return admin?.name ?? 'Unknown admin';
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download subscription invoice' })
  @ApiResponse({ status: 200, description: 'Return PDF invoice' })
  async downloadInvoice(@Param('id') id: string, @Res() res: Response) {
    const pdfDoc = await this.subscriptionsService.downloadInvoice(id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=subscription-${id}.pdf`,
    );

    pdfDoc.pipe(res);
  }
}
