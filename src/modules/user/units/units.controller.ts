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
import { UnitsService } from './units.service';
import { CreateUnitDto, UpdateUnitDto } from './dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { BuildingAccessGuard } from '../../../common/guards/building-access.guard';
import { OwnerOnlyGuard } from '../../../common/guards/owner-only.guard';
import { ManagerRolesGuard } from '../../../common/guards/manager-roles.guard';
import { RequireManagerRoles } from '../../../common/decorators/require-manager-roles.decorator';
import { User } from '../../../common/decorators/user.decorator';
import { BuildingId } from '../../../common/decorators/building-id.decorator';
import { ManagerRole } from 'generated/prisma/client';
import { SubscriptionGuard } from 'src/common/guards/subscription.guard';

@ApiTags('Units')
@ApiBearerAuth()
@Controller('v1/app/units')
@UseGuards(JwtAuthGuard, BuildingAccessGuard)
export class UnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Post()
  @UseGuards(OwnerOnlyGuard)
  @ApiOperation({ summary: 'Create a unit' })
  @ApiResponse({ status: 201, description: 'Unit created successfully' })
  async create(
    @User() user: { id: string; role: string },
    @BuildingId() buildingId: string,
    @Body() dto: CreateUnitDto,
  ) {
    const result = await this.unitsService.create(
      buildingId,
      dto,
      user.id,
      user.role,
    );
    return {
      success: true,
      data: result,
      message: 'Unit created successfully',
    };
  }

  @Get()
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.tenant_manager)
  @ApiOperation({ summary: 'Get all units' })
  @ApiResponse({ status: 200, description: 'Return all units' })
  async findAll(@BuildingId() buildingId: string) {
    const result = await this.unitsService.findAll(buildingId);
    return {
      success: true,
      data: result,
    };
  }

  @Get(':id')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(ManagerRole.tenant_manager)
  @ApiOperation({ summary: 'Get a unit by ID' })
  @ApiResponse({ status: 200, description: 'Return unit details' })
  async findOne(@BuildingId() buildingId: string, @Param('id') id: string) {
    const result = await this.unitsService.findOne(buildingId, id);
    return {
      success: true,
      data: result,
    };
  }

  @Patch(':id')
  @UseGuards(ManagerRolesGuard, SubscriptionGuard)
  @RequireManagerRoles(ManagerRole.tenant_manager)
  @ApiOperation({ summary: 'Update a unit' })
  @ApiResponse({ status: 200, description: 'Unit updated successfully' })
  async update(
    @BuildingId() buildingId: string,
    @User() user: { id: string; role: string },
    @Param('id') id: string,
    @Body() dto: UpdateUnitDto,
  ) {
    const result = await this.unitsService.update(
      buildingId,
      id,
      dto,
      user.id,
      user.role,
    );
    return {
      success: true,
      data: result,
      message: 'Unit updated successfully',
    };
  }

  @Delete(':id')
  @UseGuards(OwnerOnlyGuard)
  @ApiOperation({ summary: 'Delete a unit' })
  @ApiResponse({ status: 200, description: 'Unit deleted successfully' })
  async remove(
    @BuildingId() buildingId: string,
    @Param('id') id: string,
    @User() user: { id: string; role: string },
  ) {
    const result = await this.unitsService.remove(
      buildingId,
      id,
      user.id,
      user.role,
    );
    return {
      success: true,
      data: result,
    };
  }
}
