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
import { ManagersService } from './managers.service';
import { CreateManagerDto, UpdateManagerDto } from './dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { OwnerOnlyGuard } from 'src/common/guards/owner-only.guard';
import { User } from 'src/common/decorators/user.decorator';
import { SubscriptionGuard } from 'src/common/guards/subscription.guard';

@Controller('v1/app/managers')
@UseGuards(JwtAuthGuard, OwnerOnlyGuard, SubscriptionGuard)
export class ManagersController {
  constructor(private readonly managersService: ManagersService) {}

  @Post()
  async create(@User() user: { id: string }, @Body() dto: CreateManagerDto) {
    const result = await this.managersService.create(user.id, dto);
    return {
      success: true,
      data: result,
      message: 'Manager created successfully',
    };
  }

  @Get()
  async findAll(@User() user: { id: string }) {
    const result = await this.managersService.findAll(user.id);
    return {
      success: true,
      data: result,
    };
  }

  @Get(':id')
  async findOne(@User() user: { id: string }, @Param('id') id: string) {
    const result = await this.managersService.findOne(user.id, id);
    return {
      success: true,
      data: result,
    };
  }

  @Patch(':id')
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
  async remove(@User() user: { id: string }, @Param('id') id: string) {
    const result = await this.managersService.remove(user.id, id);
    return {
      success: true,
      data: result,
    };
  }
}
