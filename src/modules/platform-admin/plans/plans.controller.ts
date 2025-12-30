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
import { PlansService } from './plans.service';
import { CreatePlanDto, UpdatePlanDto } from './dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';

@Controller('v1/platform/plans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Post()
  @Roles('super_admin')
  async create(@Body() dto: CreatePlanDto) {
    const result = await this.plansService.create(dto);
    return {
      success: true,
      data: result,
      message: 'Plan created successfully',
    };
  }

  @Get()
  @Roles(
    'super_admin',
    'user_manager',
    'analytics_viewer',
    'system_manager',
    'billing_manager',
  )
  async findAll() {
    const result = await this.plansService.findAll();
    return {
      success: true,
      data: result,
    };
  }

  @Get(':id')
  @Roles(
    'super_admin',
    'user_manager',
    'analytics_viewer',
    'system_manager',
    'billing_manager',
  )
  async findOne(@Param('id') id: string) {
    const result = await this.plansService.findOne(id);
    return {
      success: true,
      data: result,
    };
  }

  @Patch(':id')
  @Roles('super_admin')
  async update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    const result = await this.plansService.update(id, dto);
    return {
      success: true,
      data: result,
      message: 'Plan updated successfully',
    };
  }

  @Delete(':id')
  @Roles('super_admin')
  async remove(@Param('id') id: string) {
    const result = await this.plansService.remove(id);
    return {
      success: true,
      data: result,
    };
  }
}
