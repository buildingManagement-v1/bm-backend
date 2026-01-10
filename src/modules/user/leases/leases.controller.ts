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

@Controller('v1/app/leases')
@UseGuards(JwtAuthGuard, BuildingAccessGuard, SubscriptionGuard)
export class LeasesController {
  constructor(private readonly leasesService: LeasesService) {}

  @Post()
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.tenant_manager)
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
}
