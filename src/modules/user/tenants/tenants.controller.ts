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
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { ManagerRole } from 'generated/prisma/client';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { BuildingAccessGuard } from 'src/common/guards/building-access.guard';
import { User } from 'src/common/decorators/user.decorator';
import { BuildingId } from 'src/common/decorators/building-id.decorator';
import { ManagerRolesGuard } from 'src/common/guards/manager-roles.guard';
import { RequireManagerRoles } from 'src/common/decorators/require-manager-roles.decorator';

@Controller('v1/app/tenants')
@UseGuards(JwtAuthGuard, BuildingAccessGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.tenant_manager)
  async create(
    @User() user: { id: string },
    @BuildingId() buildingId: string,
    @Body() dto: CreateTenantDto,
  ) {
    const result = await this.tenantsService.create(buildingId, user.id, dto);
    return {
      success: true,
      data: result,
      message: 'Tenant created successfully',
    };
  }

  @Get()
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.tenant_manager)
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
  async update(
    @User() user: { id: string },
    @BuildingId() buildingId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
  ) {
    const result = await this.tenantsService.update(
      id,
      buildingId,
      user.id,
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
  async remove(
    @User() user: { id: string },
    @BuildingId() buildingId: string,
    @Param('id') id: string,
  ) {
    const result = await this.tenantsService.remove(id, buildingId);
    return {
      success: true,
      data: result,
    };
  }
}
