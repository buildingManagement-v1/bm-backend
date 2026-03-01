import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StreamableFile } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PortalService } from './portal.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { SubmitMaintenanceRequestDto } from './dto';
import type { StorageEngine } from 'multer';
import multer from 'multer';

@ApiTags('Tenant Portal')
@Controller('v1/tenant')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PortalController {
  constructor(private readonly portalService: PortalService) {}

  @Get('profile')
  @ApiOperation({ summary: 'Get tenant profile' })
  @ApiResponse({ status: 200, description: 'Return tenant profile' })
  async getProfile(@User() user: { id: string }) {
    return await this.portalService.getProfile(user.id);
  }

  @Get('rent-status')
  @ApiOperation({ summary: 'Get rent status' })
  @ApiResponse({ status: 200, description: 'Return rent status' })
  async getRentStatus(@User() user: { id: string }) {
    return await this.portalService.getRentStatus(user.id);
  }

  @Get('payment-history')
  @ApiOperation({ summary: 'Get payment history (paginated)' })
  @ApiResponse({ status: 200, description: 'Return paginated payment history' })
  async getPaymentHistory(
    @User() user: { id: string },
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const offsetNum = Math.max(0, Number(offset) || 0);
    return await this.portalService.getPaymentHistory(
      user.id,
      limitNum,
      offsetNum,
    );
  }

  @Post('maintenance-requests')
  @ApiOperation({ summary: 'Submit maintenance request' })
  @ApiResponse({ status: 201, description: 'Request submitted successfully' })
  async submitMaintenanceRequest(
    @User() user: { id: string },
    @Body() dto: SubmitMaintenanceRequestDto,
  ) {
    return await this.portalService.submitMaintenanceRequest(user.id, dto);
  }

  @Get('maintenance-requests')
  @ApiOperation({ summary: 'Get maintenance requests (paginated)' })
  @ApiResponse({
    status: 200,
    description: 'Return paginated maintenance requests',
  })
  async getMaintenanceRequests(
    @User() user: { id: string },
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const offsetNum = Math.max(0, Number(offset) || 0);
    return await this.portalService.getMaintenanceRequests(
      user.id,
      limitNum,
      offsetNum,
    );
  }

  @Get('maintenance-requests/:id')
  @ApiOperation({ summary: 'Get maintenance request by ID' })
  @ApiResponse({
    status: 200,
    description: 'Return maintenance request details',
  })
  async getMaintenanceRequest(
    @User() user: { id: string },
    @Param('id') id: string,
  ) {
    return await this.portalService.getMaintenanceRequest(user.id, id);
  }

  @Post('payment-requests')
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
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        unitId: { type: 'string' },
        amount: { type: 'number' },
        type: { type: 'string', enum: ['rent', 'utility', 'deposit', 'other'] },
        paymentDate: { type: 'string' },
        monthsCovered: { type: 'string', description: 'JSON array' },
        notes: { type: 'string' },
        receipt: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({ summary: 'Submit payment request with receipt' })
  @ApiResponse({ status: 201, description: 'Payment request submitted' })
  async createPaymentRequest(
    @User() user: { id: string },
    @Body() body: Record<string, unknown>,
    @UploadedFile() file: { buffer: Buffer; originalname?: string },
  ) {
    let monthsCovered: string[] | undefined;
    const rawMonths = body.monthsCovered;
    if (typeof rawMonths === 'string' && rawMonths !== '') {
      try {
        const parsed: unknown = JSON.parse(rawMonths);
        monthsCovered =
          Array.isArray(parsed) &&
          parsed.every((x): x is string => typeof x === 'string')
            ? parsed
            : undefined;
      } catch {
        monthsCovered = undefined;
      }
    }
    const notes = typeof body.notes === 'string' ? body.notes : undefined;
    return await this.portalService.createPaymentRequest(
      user.id,
      {
        unitId: String(body.unitId),
        amount: Number(body.amount),
        type: String(body.type),
        paymentDate: String(body.paymentDate),
        monthsCovered: monthsCovered ?? undefined,
        notes,
      },
      file,
    );
  }

  @Get('payment-calendar')
  @ApiOperation({ summary: 'Get payment calendar for my leases' })
  @ApiResponse({ status: 200, description: 'Return calendar per lease' })
  async getPaymentCalendar(@User() user: { id: string }) {
    const data = await this.portalService.getPaymentCalendar(user.id);
    return { success: true, data };
  }

  @Get('upcoming-payments')
  @ApiOperation({ summary: 'Get upcoming (unpaid/overdue) rent payments' })
  @ApiResponse({ status: 200, description: 'Return upcoming payments list' })
  async getUpcomingPayments(
    @User() user: { id: string },
    @Query('limit') limit?: string,
  ) {
    const limitNum = Math.min(20, Math.max(1, Number(limit) || 10));
    const data = await this.portalService.getUpcomingPayments(
      user.id,
      limitNum,
    );
    return { success: true, data };
  }

  @Get('payment-requests')
  @ApiOperation({ summary: 'Get my payment requests (paginated)' })
  @ApiResponse({
    status: 200,
    description: 'Return paginated payment requests',
  })
  async getPaymentRequests(
    @User() user: { id: string },
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('q') q?: string,
  ) {
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const offsetNum = Math.max(0, Number(offset) || 0);
    return await this.portalService.getPaymentRequests(
      user.id,
      limitNum,
      offsetNum,
      q,
    );
  }

  @Get('payment-requests/:id/receipt')
  @ApiOperation({ summary: 'Get receipt image for a payment request' })
  @ApiResponse({ status: 200, description: 'Receipt image file' })
  async getPaymentRequestReceipt(
    @User() user: { id: string },
    @Param('id') id: string,
  ) {
    const filePath = await this.portalService.getReceiptPath(user.id, id);
    const { createReadStream } = await import('fs');
    const stream = createReadStream(filePath);
    return new StreamableFile(stream);
  }

  @Post('parking-requests')
  @ApiOperation({ summary: 'Submit parking registration request' })
  @ApiResponse({ status: 201, description: 'Parking request submitted' })
  async createParkingRequest(
    @User() user: { id: string },
    @Body() body: { leaseId: string; licensePlate: string },
  ) {
    return await this.portalService.createParkingRequest(user.id, {
      leaseId: String(body.leaseId),
      licensePlate: String(body.licensePlate ?? ''),
    });
  }

  @Get('parking-requests')
  @ApiOperation({ summary: 'Get my parking requests (paginated)' })
  @ApiResponse({
    status: 200,
    description: 'Return paginated parking requests',
  })
  async getParkingRequests(
    @User() user: { id: string },
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('q') q?: string,
  ) {
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const offsetNum = Math.max(0, Number(offset) || 0);
    return await this.portalService.getParkingRequests(
      user.id,
      limitNum,
      offsetNum,
      q,
    );
  }
}
