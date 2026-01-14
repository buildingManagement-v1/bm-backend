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
import { BuildingsService } from './buildings.service';
import { CreateBuildingDto, UpdateBuildingDto } from './dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { OwnerOnlyGuard } from 'src/common/guards/owner-only.guard';
import { User } from 'src/common/decorators/user.decorator';
import { SubscriptionGuard } from 'src/common/guards/subscription.guard';

@ApiTags('Buildings')
@ApiBearerAuth()
@Controller('v1/app/buildings')
@UseGuards(JwtAuthGuard, SubscriptionGuard)
export class BuildingsController {
  constructor(private readonly buildingsService: BuildingsService) {}

  @Post()
  @UseGuards(OwnerOnlyGuard)
  @ApiOperation({ summary: 'Create building' })
  @ApiResponse({ status: 201, description: 'Building created successfully' })
  async create(@User() user: { id: string }, @Body() dto: CreateBuildingDto) {
    const result = await this.buildingsService.create(user.id, dto);
    return {
      success: true,
      data: result,
      message: 'Building created successfully',
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get all buildings' })
  @ApiResponse({ status: 200, description: 'Return all buildings' })
  async findAll(@User() user: { id: string; role: string }) {
    const result = await this.buildingsService.findAll(user.id, user.role);
    return {
      success: true,
      data: result,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get building by ID' })
  @ApiResponse({ status: 200, description: 'Return building details' })
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
  @ApiOperation({ summary: 'Update building' })
  @ApiResponse({ status: 200, description: 'Building updated successfully' })
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
  @ApiOperation({ summary: 'Delete building' })
  @ApiResponse({ status: 200, description: 'Building deleted successfully' })
  async remove(@User() user: { id: string }, @Param('id') id: string) {
    const result = await this.buildingsService.remove(user.id, id);
    return {
      success: true,
      data: result,
    };
  }
}
