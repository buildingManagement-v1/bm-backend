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
import { User } from 'src/common/decorators/user.decorator';

@Controller('v1/platform/plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get('public')
  async findAllActive() {
    const result = await this.plansService.findAllActive();
    return {
      success: true,
      data: result,
    };
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  async create(
    @Body() dto: CreatePlanDto,
    @User() admin: { id: string; email: string },
  ) {
    const result = await this.plansService.create(dto, admin.id, admin.email);
    return {
      success: true,
      data: result,
      message: 'Plan created successfully',
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
    @User() admin: { id: string; email: string },
  ) {
    const result = await this.plansService.update(
      id,
      dto,
      admin.id,
      admin.email,
    );
    return {
      success: true,
      data: result,
      message: 'Plan updated successfully',
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  async remove(
    @Param('id') id: string,
    @User() admin: { id: string; email: string },
  ) {
    const result = await this.plansService.remove(id, admin.id, admin.email);
    return {
      success: true,
      data: result,
    };
  }
}
