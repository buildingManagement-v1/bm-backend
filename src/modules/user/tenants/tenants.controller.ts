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
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { OnboardTenantDto } from './dto/onboard-tenant.dto';
import { ManagerRole } from 'generated/prisma/client';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { BuildingAccessGuard } from 'src/common/guards/building-access.guard';
import { User } from 'src/common/decorators/user.decorator';
import { BuildingId } from 'src/common/decorators/building-id.decorator';
import { ManagerRolesGuard } from 'src/common/guards/manager-roles.guard';
import { RequireManagerRoles } from 'src/common/decorators/require-manager-roles.decorator';
import { SubscriptionGuard } from 'src/common/guards/subscription.guard';

@ApiTags('Tenants')
@ApiBearerAuth()
@Controller('v1/app/tenants')
@UseGuards(JwtAuthGuard, BuildingAccessGuard, SubscriptionGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.tenant_manager)
  @ApiOperation({ summary: 'Create a tenant' })
  @ApiResponse({ status: 201, description: 'Tenant created successfully' })
  async create(
    @User() user: { id: string; role: string },
    @BuildingId() buildingId: string,
    @Body() dto: CreateTenantDto,
  ) {
    const result = await this.tenantsService.create(
      buildingId,
      user.id,
      user.role,
      dto,
    );
    return {
      success: true,
      data: result,
      message: 'Tenant created successfully',
    };
  }

  @Get()
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.tenant_manager)
  @ApiOperation({ summary: 'Get all tenants' })
  @ApiResponse({ status: 200, description: 'Return all tenants' })
  async findAll(
    @User() user: { id: string },
    @BuildingId() buildingId: string,
  ) {
    const result = await this.tenantsService.findAll(buildingId);
    return {
      success: true,
      data: result,
    };
  }

  @Get(':id')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.tenant_manager)
  @ApiOperation({ summary: 'Get a tenant by ID' })
  @ApiResponse({ status: 200, description: 'Return tenant details' })
  async findOne(
    @User() user: { id: string },
    @BuildingId() buildingId: string,
    @Param('id') id: string,
  ) {
    const result = await this.tenantsService.findOne(id, buildingId);
    return {
      success: true,
      data: result,
    };
  }

  @Patch(':id')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.tenant_manager)
  @ApiOperation({ summary: 'Update a tenant' })
  @ApiResponse({ status: 200, description: 'Tenant updated successfully' })
  async update(
    @User() user: { id: string; role: string },
    @BuildingId() buildingId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
  ) {
    const result = await this.tenantsService.update(
      id,
      buildingId,
      user.id,
      user.role,
      dto,
    );
    return {
      success: true,
      data: result,
      message: 'Tenant updated successfully',
    };
  }

  @Delete(':id')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.tenant_manager)
  @ApiOperation({ summary: 'Delete a tenant' })
  @ApiResponse({ status: 200, description: 'Tenant deleted successfully' })
  async remove(
    @User() user: { id: string; role: string },
    @BuildingId() buildingId: string,
    @Param('id') id: string,
  ) {
    const result = await this.tenantsService.remove(
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

  @Post('onboard')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.tenant_manager)
  @ApiOperation({
    summary: 'Onboard a tenant (create tenant + assign unit + create lease)',
  })
  @ApiResponse({ status: 201, description: 'Tenant onboarded successfully' })
  async onboard(
    @User() user: { id: string; role: string },
    @BuildingId() buildingId: string,
    @Body() dto: OnboardTenantDto,
  ) {
    const result = await this.tenantsService.onboard(
      buildingId,
      user.id,
      user.role,
      dto,
    );
    return {
      success: true,
      data: result,
      message: 'Tenant onboarded successfully',
    };
  }
}
