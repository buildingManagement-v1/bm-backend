import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { User } from 'src/common/decorators/user.decorator';
import { streamUpload } from 'src/common/uploads/uploads.util';
import { PrismaService } from 'src/prisma/prisma.service';
import { BillingService } from './billing.service';
import { RejectSubscriptionRequestDto } from './dto';

@ApiTags('Platform Billing')
@ApiBearerAuth()
@Controller('v1/platform/subscription-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'billing_manager')
export class AdminBillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Roles('super_admin', 'billing_manager')
  @ApiOperation({ summary: 'List owner plan requests (pending first)' })
  async list(
    @Query('status') status?: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const { items, pageInfo } = await this.billingService.adminList({
      status,
      q,
      limit: Math.min(100, Math.max(1, Number(limit) || 20)),
      offset: Math.max(0, Number(offset) || 0),
    });
    return { success: true, data: items, meta: { page_info: pageInfo } };
  }

  @Get(':id/receipt')
  @Roles('super_admin', 'billing_manager')
  @ApiOperation({ summary: 'View the uploaded bank-transfer receipt' })
  async receipt(@Param('id', new ParseUUIDPipe()) id: string) {
    return streamUpload(await this.billingService.receiptFor(id));
  }

  @Post(':id/approve')
  @Roles('super_admin', 'billing_manager')
  @ApiOperation({ summary: 'Approve: payment verified, activate the plan' })
  @ApiResponse({ status: 201, description: 'Plan activated' })
  async approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @User() user: { id: string },
  ) {
    const data = await this.billingService.approve(
      id,
      await this.admin(user.id),
    );
    return { success: true, data, message: data.message };
  }

  @Post(':id/reject')
  @Roles('super_admin', 'billing_manager')
  @ApiOperation({ summary: 'Reject: payment could not be verified' })
  async reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RejectSubscriptionRequestDto,
    @User() user: { id: string },
  ) {
    const data = await this.billingService.reject(
      id,
      await this.admin(user.id),
      dto.reason,
    );
    return { success: true, data, message: data.message };
  }

  private async admin(id: string) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    return admin ?? { id, name: 'Unknown admin' };
  }
}
