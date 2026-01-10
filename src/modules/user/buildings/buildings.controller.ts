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
import { BuildingsService } from './buildings.service';
import { CreateBuildingDto, UpdateBuildingDto } from './dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { OwnerOnlyGuard } from 'src/common/guards/owner-only.guard';
import { User } from 'src/common/decorators/user.decorator';
import { SubscriptionGuard } from 'src/common/guards/subscription.guard';

@Controller('v1/app/buildings')
@UseGuards(JwtAuthGuard, SubscriptionGuard)
export class BuildingsController {
  constructor(private readonly buildingsService: BuildingsService) {}

  @Post()
  @UseGuards(OwnerOnlyGuard)
  async create(@User() user: { id: string }, @Body() dto: CreateBuildingDto) {
    const result = await this.buildingsService.create(user.id, dto);
    return {
      success: true,
      data: result,
      message: 'Building created successfully',
    };
  }

  @Get()
  async findAll(@User() user: { id: string; role: string }) {
    const result = await this.buildingsService.findAll(user.id, user.role);
    return {
      success: true,
      data: result,
    };
  }

  @Get(':id')
  async findOne(
    @User() user: { id: string; role: string },
    @Param('id') id: string,
  ) {
    const result = await this.buildingsService.findOne(user.id, id, user.role);
    return {
      success: true,
      data: result,
    };
  }

  @Patch(':id')
  @UseGuards(OwnerOnlyGuard)
  async update(
    @User() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateBuildingDto,
  ) {
    const result = await this.buildingsService.update(user.id, id, dto);
    return {
      success: true,
      data: result,
      message: 'Building updated successfully',
    };
  }

  @Delete(':id')
  @UseGuards(OwnerOnlyGuard)
  async remove(@User() user: { id: string }, @Param('id') id: string) {
    const result = await this.buildingsService.remove(user.id, id);
    return {
      success: true,
      data: result,
    };
  }
}
