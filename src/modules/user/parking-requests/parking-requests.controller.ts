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
import { ParkingRequestsService } from './parking-requests.service';
import { ParkingService } from '../parking/parking.service';
import { ManagerRole } from 'generated/prisma/client';
import { BuildingId } from 'src/common/decorators/building-id.decorator';
import { User } from 'src/common/decorators/user.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { BuildingAccessGuard } from 'src/common/guards/building-access.guard';
import { ManagerRolesGuard } from 'src/common/guards/manager-roles.guard';
import { RequireManagerRoles } from 'src/common/decorators/require-manager-roles.decorator';
import { SubscriptionGuard } from 'src/common/guards/subscription.guard';

@ApiTags('Parking Requests')
@ApiBearerAuth()
@Controller('v1/app/parking-requests')
@UseGuards(JwtAuthGuard, BuildingAccessGuard, SubscriptionGuard)
export class ParkingRequestsController {
  constructor(
    private parkingRequestsService: ParkingRequestsService,
    private parkingService: ParkingService,
  ) {}

  @Get()
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(
    ManagerRole.tenant_manager,
    ManagerRole.operations_manager,
  )
  @ApiOperation({ summary: 'List tenant parking requests (paginated)' })
  @ApiResponse({ status: 200, description: 'Return paginated requests' })
  async findAll(
    @BuildingId() buildingId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('status') status?: string,
    @Query('q') q?: string,
  ) {
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const offsetNum = Math.max(0, Number(offset) || 0);
    const result = await this.parkingRequestsService.findAll(
      buildingId,
      limitNum,
      offsetNum,
      { status, q },
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
    ManagerRole.tenant_manager,
    ManagerRole.operations_manager,
  )
  @ApiOperation({ summary: 'Get parking request by ID' })
  @ApiResponse({ status: 200, description: 'Return request details' })
  async findOne(@BuildingId() buildingId: string, @Param('id') id: string) {
    const request = await this.parkingRequestsService.findOne(id, buildingId);
    return { success: true, data: request };
  }

  @Post(':id/approve')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(
    ManagerRole.tenant_manager,
    ManagerRole.operations_manager,
  )
  @ApiOperation({ summary: 'Approve parking request (creates registration)' })
  @ApiResponse({
    status: 200,
    description: 'Parking registration created and request approved',
  })
  async approve(
    @BuildingId() buildingId: string,
    @Param('id') id: string,
    @User() user: { id: string },
  ) {
    const registration = await this.parkingService.createFromRequest(
      id,
      buildingId,
      user.id,
    );
    return {
      success: true,
      data: registration,
      message: 'Parking request approved and car registered',
    };
  }

  @Post(':id/reject')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(
    ManagerRole.tenant_manager,
    ManagerRole.operations_manager,
  )
  @ApiOperation({ summary: 'Reject parking request' })
  @ApiResponse({ status: 200, description: 'Request rejected' })
  async reject(
    @BuildingId() buildingId: string,
    @Param('id') id: string,
    @User() user: { id: string },
    @Body() body: { rejectionReason?: string },
  ) {
    await this.parkingRequestsService.reject(
      id,
      buildingId,
      user.id,
      body?.rejectionReason,
    );
    return { success: true, message: 'Parking request rejected' };
  }
}
