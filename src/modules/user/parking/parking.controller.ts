import {
  Controller,
  Get,
  Post,
  Delete,
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
import { ParkingService } from './parking.service';
import { CreateParkingRegistrationDto } from './dto';
import { ManagerRole } from 'generated/prisma/client';
import { BuildingId } from 'src/common/decorators/building-id.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { BuildingAccessGuard } from 'src/common/guards/building-access.guard';
import { ManagerRolesGuard } from 'src/common/guards/manager-roles.guard';
import { RequireManagerRoles } from 'src/common/decorators/require-manager-roles.decorator';
import { SubscriptionGuard } from 'src/common/guards/subscription.guard';

@ApiTags('Parking')
@ApiBearerAuth()
@Controller('v1/app/parking')
@UseGuards(JwtAuthGuard, BuildingAccessGuard, SubscriptionGuard)
export class ParkingController {
  constructor(private readonly parkingService: ParkingService) {}

  @Post()
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.tenant_manager)
  @ApiOperation({ summary: 'Register a car for a tenant unit' })
  @ApiResponse({ status: 201, description: 'Car registered successfully' })
  @ApiResponse({
    status: 400,
    description: 'Parking limit reached or invalid lease',
  })
  async create(
    @BuildingId() buildingId: string,
    @Body() dto: CreateParkingRegistrationDto,
  ) {
    const result = await this.parkingService.create(buildingId, dto);
    return {
      success: true,
      data: result,
      message: 'Car registered successfully',
    };
  }

  @Get()
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.tenant_manager)
  @ApiOperation({ summary: 'List parking registrations (paginated)' })
  @ApiResponse({ status: 200, description: 'Return paginated registrations' })
  async findAll(
    @BuildingId() buildingId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('q') q?: string,
    @Query('tenantId') tenantId?: string,
    @Query('unitId') unitId?: string,
  ) {
    const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
    const offsetNum = Math.max(0, Number(offset) || 0);
    const result = await this.parkingService.findAll(
      buildingId,
      limitNum,
      offsetNum,
      {
        q,
        tenantId,
        unitId,
      },
    );
    return {
      success: true,
      data: result.data,
      meta: result.meta,
    };
  }

  @Delete(':id')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.tenant_manager)
  @ApiOperation({ summary: 'Remove a parking registration' })
  @ApiResponse({ status: 200, description: 'Registration removed' })
  async remove(@BuildingId() buildingId: string, @Param('id') id: string) {
    await this.parkingService.remove(id, buildingId);
    return { success: true, message: 'Registration removed' };
  }
}
