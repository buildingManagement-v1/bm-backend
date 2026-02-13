import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
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

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('v1/app/payments')
@UseGuards(JwtAuthGuard, BuildingAccessGuard, SubscriptionGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.payment_manager)
  @ApiOperation({ summary: 'Create a payment' })
  @ApiResponse({ status: 201, description: 'Payment recorded successfully' })
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
  @ApiOperation({ summary: 'Get all payments (paginated)' })
  @ApiResponse({ status: 200, description: 'Return paginated payments' })
  async findAll(
    @BuildingId() buildingId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    const limitNum: number = Math.min(100, Math.max(1, Number(limit) || 20));
    const offsetNum: number = Math.max(0, Number(offset) || 0);
    const result = await this.paymentsService.findAll(
      buildingId,
      limitNum,
      offsetNum,
      { type, status, q },
    );
    return {
      success: true,
      data: result.data,
      meta: result.meta,
    };
  }

  @Get(':id')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.payment_manager)
  @ApiOperation({ summary: 'Get a payment by ID' })
  @ApiResponse({ status: 200, description: 'Return payment details' })
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
  @ApiOperation({ summary: 'Get payment calendar for a tenant' })
  @ApiResponse({ status: 200, description: 'Return payment calendar' })
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
