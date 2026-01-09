import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';

@Controller('v1/platform/users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'billing_manager', 'user_manager')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async findAll(@Query('search') search?: string) {
    const result = await this.usersService.findAll(search);
    return {
      success: true,
      data: result,
    };
  }
}
