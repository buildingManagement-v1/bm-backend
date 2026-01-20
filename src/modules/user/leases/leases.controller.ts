import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { LeasesService } from './leases.service';
import { CreateLeaseDto, UpdateLeaseDto } from './dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { BuildingAccessGuard } from '../../../common/guards/building-access.guard';
import { ManagerRolesGuard } from '../../../common/guards/manager-roles.guard';
import { RequireManagerRoles } from '../../../common/decorators/require-manager-roles.decorator';
import { BuildingId } from '../../../common/decorators/building-id.decorator';
import { ManagerRole } from 'generated/prisma/client';
import { User } from 'src/common/decorators/user.decorator';
import { SubscriptionGuard } from 'src/common/guards/subscription.guard';

@ApiTags('Leases')
@ApiBearerAuth()
@Controller('v1/app/leases')
@UseGuards(JwtAuthGuard, BuildingAccessGuard, SubscriptionGuard)
export class LeasesController {
  constructor(private readonly leasesService: LeasesService) {}

  @Post()
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.tenant_manager)
  @ApiOperation({ summary: 'Create lease' })
  @ApiResponse({ status: 201, description: 'Lease created successfully' })
  async create(
    @BuildingId() buildingId: string,
    @Body() dto: CreateLeaseDto,
    @User() user: { id: string; role: string },
  ) {
    const result = await this.leasesService.create(
      buildingId,
      dto,
      user.id,
      user.role,
    );
    return {
      success: true,
      data: result,
      message: 'Lease created successfully',
    };
  }

  @Get()
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.tenant_manager)
  @ApiOperation({ summary: 'Get all leases' })
  @ApiResponse({ status: 200, description: 'Return all leases' })
  async findAll(@BuildingId() buildingId: string) {
    const result = await this.leasesService.findAll(buildingId);
    return {
      success: true,
      data: result,
    };
  }

  @Get(':id')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.tenant_manager)
  @ApiOperation({ summary: 'Get lease by ID' })
  @ApiResponse({ status: 200, description: 'Return lease details' })
  async findOne(@BuildingId() buildingId: string, @Param('id') id: string) {
    const result = await this.leasesService.findOne(id, buildingId);
    return {
      success: true,
      data: result,
    };
  }

  @Patch(':id')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.tenant_manager)
  @ApiOperation({ summary: 'Update lease' })
  @ApiResponse({ status: 200, description: 'Lease updated successfully' })
  async update(
    @BuildingId() buildingId: string,
    @Param('id') id: string,
    @Body() dto: UpdateLeaseDto,
    @User() user: { id: string; role: string },
  ) {
    const result = await this.leasesService.update(
      id,
      buildingId,
      dto,
      user.id,
      user.role,
    );
    return {
      success: true,
      data: result,
      message: 'Lease updated successfully',
    };
  }

  @Delete(':id')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.tenant_manager)
  @ApiOperation({ summary: 'Delete lease' })
  @ApiResponse({ status: 200, description: 'Lease deleted successfully' })
  async remove(
    @BuildingId() buildingId: string,
    @Param('id') id: string,
    @User() user: { id: string; role: string },
  ) {
    const result = await this.leasesService.remove(
      id,
      buildingId,
      user.id,
      user.role,
    );
    return {
      success: true,
      data: result,
    };
  }

  @Get('tenant/:tenantId')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.tenant_manager)
  @ApiOperation({ summary: 'Get leases by tenant ID' })
  @ApiResponse({ status: 200, description: 'Return tenant leases' })
  async findByTenant(
    @BuildingId() buildingId: string,
    @Param('tenantId') tenantId: string,
  ) {
    const result = await this.leasesService.findByTenant(buildingId, tenantId);
    return {
      success: true,
      data: result,
    };
  }
}
