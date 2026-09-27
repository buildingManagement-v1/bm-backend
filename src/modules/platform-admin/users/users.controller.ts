import {
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateOwnerDto, UpdateAccountStatusDto } from './dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { User } from '../../../common/decorators/user.decorator';

@ApiTags('Platform Admin Users')
@Controller('v1/platform')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  private async adminOf(id: string) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    return admin ?? { id, name: 'Unknown admin' };
  }

  // ── Owners ──────────────────────────────────────────────────────────────

  @Post('users')
  @Roles('super_admin', 'user_manager')
  async createOwner(
    @Body() dto: CreateOwnerDto,
    @User() admin: { id: string },
  ) {
    const data = await this.usersService.createOwner(
      dto,
      await this.adminOf(admin.id),
    );
    return {
      success: true,
      data,
      message: 'Owner created. Login details were emailed to them.',
    };
  }

  @Post('users/:id/send-password-reset')
  @Roles('super_admin', 'user_manager')
  async sendPasswordReset(
    @Param('id', new ParseUUIDPipe()) id: string,
    @User() admin: { id: string },
  ) {
    const data = await this.usersService.sendOwnerPasswordReset(
      id,
      await this.adminOf(admin.id),
    );
    return { success: true, data, message: data.message };
  }

  @Get('users/:id')
  @Roles('super_admin', 'user_manager', 'billing_manager')
  async getOwner(@Param('id', new ParseUUIDPipe()) id: string) {
    return { success: true, data: await this.usersService.getOwnerDetail(id) };
  }

  @Get('users')
  @Roles('super_admin', 'user_manager', 'billing_manager')
  @ApiOperation({ summary: 'List all owners with pagination and filters' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'inactive'] })
  @ApiQuery({ name: 'deleted', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async findAllOwners(
    @Query('search') search?: string,
    @Query('status') status?: 'active' | 'inactive',
    @Query('deleted') deleted?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.usersService.findAllOwners({
      search,
      status,
      deleted: deleted === 'true',
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
    return { success: true, ...result };
  }

  @Delete('users/:id')
  @Roles('super_admin')
  @ApiOperation({
    summary:
      'Schedule an owner account for deletion (soft-delete now, purge after grace period)',
  })
  async softDeleteOwner(
    @Param('id') id: string,
    @User() admin: { id: string },
  ) {
    const result = await this.usersService.softDeleteOwner(id, admin.id);
    return {
      success: true,
      data: result,
      message: 'Account scheduled for deletion',
    };
  }

  @Post('users/:id/restore')
  @Roles('super_admin')
  @ApiOperation({ summary: 'Restore an owner account within the grace period' })
  async restoreOwner(@Param('id') id: string, @User() admin: { id: string }) {
    const result = await this.usersService.restoreOwner(id, admin.id);
    return { success: true, data: result, message: 'Account restored' };
  }

  @Patch('users/:id/status')
  @Roles('super_admin', 'user_manager')
  @ApiOperation({ summary: 'Activate or deactivate an owner' })
  async updateOwnerStatus(
    @Param('id') id: string,
    @Body() body: UpdateAccountStatusDto,
    @User() admin: { id: string },
  ) {
    const result = await this.usersService.updateOwnerStatus(
      id,
      body.status,
      await this.adminOf(admin.id),
    );
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
    @Body() body: UpdateAccountStatusDto,
    @User() admin: { id: string },
  ) {
    const result = await this.usersService.updateManagerStatus(
      id,
      body.status,
      await this.adminOf(admin.id),
    );
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
    @Body() body: UpdateAccountStatusDto,
    @User() admin: { id: string },
  ) {
    const result = await this.usersService.updateTenantStatus(
      id,
      body.status,
      await this.adminOf(admin.id),
    );
    return { success: true, data: result, message: 'Status updated' };
  }
}
