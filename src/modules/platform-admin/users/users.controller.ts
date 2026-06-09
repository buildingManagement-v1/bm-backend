import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';

@ApiTags('Platform Admin Users')
@Controller('v1/platform')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // ── Owners ──────────────────────────────────────────────────────────────

  @Get('users')
  @Roles('super_admin', 'user_manager', 'billing_manager')
  @ApiOperation({ summary: 'List all owners with pagination and filters' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAllOwners(
    @Query('search') search?: string,
    @Query('status') status?: 'active' | 'inactive',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.usersService.findAllOwners({
      search,
      status,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
    return { success: true, ...result };
  }

  @Patch('users/:id/status')
  @Roles('super_admin', 'user_manager')
  @ApiOperation({ summary: 'Activate or deactivate an owner' })
  async updateOwnerStatus(
    @Param('id') id: string,
    @Body() body: { status: 'active' | 'inactive' },
  ) {
    const result = await this.usersService.updateOwnerStatus(id, body.status);
    return { success: true, data: result, message: 'Status updated' };
  }

  // ── Managers ─────────────────────────────────────────────────────────────

  @Get('managers')
  @Roles('super_admin', 'user_manager')
  @ApiOperation({ summary: 'List all managers with pagination and filters' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAllManagers(
    @Query('search') search?: string,
    @Query('status') status?: 'active' | 'inactive',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.usersService.findAllManagers({
      search,
      status,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
    return { success: true, ...result };
  }

  @Patch('managers/:id/status')
  @Roles('super_admin', 'user_manager')
  @ApiOperation({ summary: 'Activate or deactivate a manager' })
  async updateManagerStatus(
    @Param('id') id: string,
    @Body() body: { status: 'active' | 'inactive' },
  ) {
    const result = await this.usersService.updateManagerStatus(id, body.status);
    return { success: true, data: result, message: 'Status updated' };
  }

  // ── Tenants ──────────────────────────────────────────────────────────────

  @Get('tenants')
  @Roles('super_admin', 'user_manager')
  @ApiOperation({ summary: 'List all tenants with pagination and filters' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive'] })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAllTenants(
    @Query('search') search?: string,
    @Query('status') status?: 'active' | 'inactive',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.usersService.findAllTenants({
      search,
      status,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
    return { success: true, ...result };
  }

  @Patch('tenants/:id/status')
  @Roles('super_admin', 'user_manager')
  @ApiOperation({ summary: 'Activate or deactivate a tenant' })
  async updateTenantStatus(
    @Param('id') id: string,
    @Body() body: { status: 'active' | 'inactive' },
  ) {
    const result = await this.usersService.updateTenantStatus(id, body.status);
    return { success: true, data: result, message: 'Status updated' };
  }
}
