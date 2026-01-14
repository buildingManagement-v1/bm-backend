import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { PortalService } from './portal.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { SubmitMaintenanceRequestDto } from './dto';

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
  @ApiOperation({ summary: 'Get payment history' })
  @ApiResponse({ status: 200, description: 'Return payment history' })
  async getPaymentHistory(@User() user: { id: string }) {
    return await this.portalService.getPaymentHistory(user.id);
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
  @ApiOperation({ summary: 'Get all maintenance requests' })
  @ApiResponse({ status: 200, description: 'Return all maintenance requests' })
  async getMaintenanceRequests(@User() user: { id: string }) {
    return await this.portalService.getMaintenanceRequests(user.id);
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
}
