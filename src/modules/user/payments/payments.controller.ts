import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto';
import { ManagerRole } from 'generated/prisma/client';
import { User } from 'src/common/decorators/user.decorator';
import { BuildingAccessGuard } from 'src/common/guards/building-access.guard';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { ManagerRolesGuard } from 'src/common/guards/manager-roles.guard';
import { RequireManagerRoles } from 'src/common/decorators/require-manager-roles.decorator';
import { BuildingId } from 'src/common/decorators/building-id.decorator';
import { SubscriptionGuard } from 'src/common/guards/subscription.guard';

@Controller('v1/app/payments')
@UseGuards(JwtAuthGuard, BuildingAccessGuard, SubscriptionGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.payment_manager)
  async create(
    @BuildingId() buildingId: string,
    @Body() dto: CreatePaymentDto,
    @User() user: { id: string; role: string },
  ) {
    const result = await this.paymentsService.create(
      buildingId,
      dto,
      user.id,
      user.role,
    );
    return {
      success: true,
      data: result,
      message: 'Payment recorded successfully',
    };
  }

  @Get()
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.payment_manager)
  async findAll(@BuildingId() buildingId: string) {
    const result = await this.paymentsService.findAll(buildingId);
    return {
      success: true,
      data: result,
    };
  }

  @Get(':id')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.payment_manager)
  async findOne(@BuildingId() buildingId: string, @Param('id') id: string) {
    const result = await this.paymentsService.findOne(id, buildingId);
    return {
      success: true,
      data: result,
    };
  }

  @Get('calendar/:tenantId')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.payment_manager)
  async getPaymentCalendar(
    @BuildingId() buildingId: string,
    @Param('tenantId') tenantId: string,
  ) {
    const result = await this.paymentsService.getPaymentCalendar(
      buildingId,
      tenantId,
    );
    return {
      success: true,
      data: result,
    };
  }
}
