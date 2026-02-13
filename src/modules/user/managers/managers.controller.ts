import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { ManagersService } from './managers.service';
import { CreateManagerDto, UpdateManagerDto } from './dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { OwnerOnlyGuard } from 'src/common/guards/owner-only.guard';
import { User } from 'src/common/decorators/user.decorator';
import { SubscriptionGuard } from 'src/common/guards/subscription.guard';

@ApiTags('Managers')
@ApiBearerAuth()
@Controller('v1/app/managers')
@UseGuards(JwtAuthGuard, OwnerOnlyGuard, SubscriptionGuard)
export class ManagersController {
  constructor(private readonly managersService: ManagersService) {}

  @Post()
  @ApiOperation({ summary: 'Create a manager' })
  @ApiResponse({ status: 201, description: 'Manager created successfully' })
  async create(@User() user: { id: string }, @Body() dto: CreateManagerDto) {
    const result = await this.managersService.create(user.id, dto);
    return {
      success: true,
      data: result,
      message: 'Manager created successfully',
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get all managers (paginated)' })
  @ApiResponse({ status: 200, description: 'Return paginated managers' })
  async findAll(
    @User() user: { id: string },
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const limitNum: number = Math.min(100, Math.max(1, Number(limit) || 20));
    const offsetNum: number = Math.max(0, Number(offset) || 0);
    const result = await this.managersService.findAll(
      user.id,
      limitNum,
      offsetNum,
    );
    return {
      success: true,
      data: result.data,
      meta: result.meta,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a manager by ID' })
  @ApiResponse({ status: 200, description: 'Return manager details' })
  async findOne(@User() user: { id: string }, @Param('id') id: string) {
    const result = await this.managersService.findOne(user.id, id);
    return {
      success: true,
      data: result,
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a manager' })
  @ApiResponse({ status: 200, description: 'Manager updated successfully' })
  async update(
    @User() user: { id: string },
    @Param('id') id: string,
    @Body() dto: UpdateManagerDto,
  ) {
    const result = await this.managersService.update(user.id, id, dto);
    return {
      success: true,
      data: result,
      message: 'Manager updated successfully',
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a manager' })
  @ApiResponse({ status: 200, description: 'Manager deleted successfully' })
  async remove(@User() user: { id: string }, @Param('id') id: string) {
    const result = await this.managersService.remove(user.id, id);
    return {
      success: true,
      data: result,
    };
  }
}
