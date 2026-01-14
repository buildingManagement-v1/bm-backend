import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { MaintenanceRequestsService } from './maintenance-requests.service';
import {
  CreateMaintenanceRequestDto,
  UpdateMaintenanceRequestDto,
} from './dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { BuildingAccessGuard } from '../../../common/guards/building-access.guard';
import { ManagerRolesGuard } from '../../../common/guards/manager-roles.guard';
import { RequireManagerRoles } from '../../../common/decorators/require-manager-roles.decorator';
import { User } from '../../../common/decorators/user.decorator';
import { BuildingId } from '../../../common/decorators/building-id.decorator';
import { ManagerRole } from 'generated/prisma/client';
import { SubscriptionGuard } from 'src/common/guards/subscription.guard';

@Controller('v1/app/maintenance-requests')
@UseGuards(JwtAuthGuard, BuildingAccessGuard, SubscriptionGuard)
export class MaintenanceRequestsController {
  constructor(
    private readonly maintenanceRequestsService: MaintenanceRequestsService,
  ) {}

  @Post()
  async create(
    @User() user: { id: string; role?: string },
    @BuildingId() buildingId: string,
    @Body() dto: CreateMaintenanceRequestDto,
  ) {
    const result = await this.maintenanceRequestsService.create(
      buildingId,
      user.id,
      user.role || '',
      dto,
    );
    return {
      success: true,
      data: result,
      message: 'Maintenance request created successfully',
    };
  }

  @Get()
  async findAll(
    @User() user: { id: string; role?: string },
    @BuildingId() buildingId: string,
  ) {
    const result = await this.maintenanceRequestsService.findAll(
      buildingId,
      user.id,
      user.role,
    );
    return {
      success: true,
      data: result,
    };
  }

  @Get(':id')
  async findOne(
    @User() user: { id: string; role?: string },
    @BuildingId() buildingId: string,
    @Param('id') id: string,
  ) {
    const result = await this.maintenanceRequestsService.findOne(
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

  @Patch(':id')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.maintenance_manager)
  async update(
    @User() user: { id: string; role: string },
    @BuildingId() buildingId: string,
    @Param('id') id: string,
    @Body() dto: UpdateMaintenanceRequestDto,
  ) {
    const result = await this.maintenanceRequestsService.update(
      id,
      buildingId,
      user.id,
      user.role,
      dto,
    );
    return {
      success: true,
      data: result,
      message: 'Maintenance request updated successfully',
    };
  }

  @Delete(':id')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.maintenance_manager)
  async remove(
    @User() user: { id: string; role: string },
    @BuildingId() buildingId: string,
    @Param('id') id: string,
  ) {
    await this.maintenanceRequestsService.remove(
      id,
      buildingId,
      user.id,
      user.role,
    );
    return {
      success: true,
      message: 'Maintenance request deleted successfully',
    };
  }
}
