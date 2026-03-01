import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { StreamableFile } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { PaymentRequestsService } from './payment-requests.service';
import { PaymentsService } from '../payments/payments.service';
import { ManagerRole } from 'generated/prisma/client';
import { BuildingId } from 'src/common/decorators/building-id.decorator';
import { User } from 'src/common/decorators/user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { BuildingAccessGuard } from 'src/common/guards/building-access.guard';
import { ManagerRolesGuard } from 'src/common/guards/manager-roles.guard';
import { RequireManagerRoles } from 'src/common/decorators/require-manager-roles.decorator';
import { SubscriptionGuard } from 'src/common/guards/subscription.guard';

@ApiTags('Payment Requests')
@ApiBearerAuth()
@Controller('v1/app/payment-requests')
@UseGuards(JwtAuthGuard, BuildingAccessGuard, SubscriptionGuard)
export class PaymentRequestsController {
  constructor(
    private paymentRequestsService: PaymentRequestsService,
    private paymentsService: PaymentsService,
  ) {}

  @Get()
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(
    ManagerRole.payment_manager,
    ManagerRole.operations_manager,
  )
  @ApiOperation({ summary: 'List tenant payment requests (paginated)' })
  @ApiResponse({ status: 200, description: 'Return paginated requests' })
  async findAll(
    @BuildingId() buildingId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
  ) {
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const offsetNum = Math.max(0, Number(offset) || 0);
    const result = await this.paymentRequestsService.findAll(
      buildingId,
      limitNum,
      offsetNum,
      { status },
    );
    return {
      success: true,
      data: result.data,
      meta: result.meta,
    };
  }

  @Get(':id')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(
    ManagerRole.payment_manager,
    ManagerRole.operations_manager,
  )
  @ApiOperation({ summary: 'Get payment request by ID' })
  @ApiResponse({ status: 200, description: 'Return request details' })
  async findOne(@BuildingId() buildingId: string, @Param('id') id: string) {
    const request = await this.paymentRequestsService.findOne(id, buildingId);
    return { success: true, data: request };
  }

  @Post(':id/approve')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(
    ManagerRole.payment_manager,
    ManagerRole.operations_manager,
  )
  @ApiOperation({ summary: 'Approve payment request (creates real payment)' })
  @ApiResponse({
    status: 200,
    description: 'Payment created and request approved',
  })
  async approve(
    @BuildingId() buildingId: string,
    @Param('id') id: string,
    @User() user: { id: string; role: string },
  ) {
    const payment = await this.paymentsService.createFromRequest(
      id,
      buildingId,
      user.id,
      user.role,
    );
    return {
      success: true,
      data: payment,
      message: 'Payment request approved and payment recorded',
    };
  }

  @Post(':id/reject')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(
    ManagerRole.payment_manager,
    ManagerRole.operations_manager,
  )
  @ApiOperation({ summary: 'Reject payment request' })
  @ApiResponse({ status: 200, description: 'Request rejected' })
  async reject(
    @BuildingId() buildingId: string,
    @Param('id') id: string,
    @User() user: { id: string },
    @Body() body: { rejectionReason?: string },
  ) {
    await this.paymentRequestsService.reject(
      id,
      buildingId,
      user.id,
      body?.rejectionReason,
    );
    return { success: true, message: 'Payment request rejected' };
  }

  @Get(':id/receipt')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(
    ManagerRole.payment_manager,
    ManagerRole.operations_manager,
  )
  @ApiOperation({ summary: 'Get receipt image for a payment request' })
  @ApiResponse({ status: 200, description: 'Receipt image file' })
  async getReceipt(@BuildingId() buildingId: string, @Param('id') id: string) {
    const filePath = await this.paymentRequestsService.getReceiptPath(
      id,
      buildingId,
    );
    const { createReadStream } = await import('fs');
    const stream = createReadStream(filePath);
    return new StreamableFile(stream);
  }
}
