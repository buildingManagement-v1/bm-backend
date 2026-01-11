import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Res,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionDto, UpdateSubscriptionDto } from './dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { User } from '../../../common/decorators/user.decorator';
import { UpgradeSubscriptionDto } from './dto/upgrade-subscription.dto';
import type { Response } from 'express';

@Controller('v1/platform/subscriptions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'billing_manager')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post()
  async create(
    @Body() createSubscriptionDto: CreateSubscriptionDto,
    @User() admin: { id: string; email: string },
  ) {
    return await this.subscriptionsService.create(
      createSubscriptionDto,
      admin.id,
      admin.email,
    );
  }

  @Get('all')
  async findAll() {
    return await this.subscriptionsService.findAllSubscriptions();
  }

  @Get('user/:userId')
  async findAllByUser(@Param('userId') userId: string) {
    return await this.subscriptionsService.findAll(userId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return await this.subscriptionsService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateSubscriptionDto: UpdateSubscriptionDto,
    @User() admin: { id: string; email: string },
  ) {
    return await this.subscriptionsService.update(
      id,
      updateSubscriptionDto,
      admin.id,
      admin.email,
    );
  }

  @Post(':id/upgrade')
  async upgrade(
    @Param('id') id: string,
    @Body() upgradeDto: UpgradeSubscriptionDto,
    @User() admin: { id: string; email: string },
  ) {
    return await this.subscriptionsService.upgrade(
      id,
      upgradeDto.newPlanId,
      upgradeDto.newBuildingCount,
      upgradeDto.newManagerCount,
      admin.id,
      admin.email,
    );
  }

  @Post(':id/calculate-upgrade')
  async calculateUpgrade(
    @Param('id') id: string,
    @Body() dto: UpgradeSubscriptionDto,
  ) {
    return await this.subscriptionsService.calculateUpgradeProrating(
      id,
      dto.newPlanId,
      dto.newBuildingCount,
      dto.newManagerCount,
    );
  }

  @Get(':id/download')
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
