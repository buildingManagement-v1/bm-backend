import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AppVersionService } from './app-version.service';
import { UpdateAppVersionDto } from './dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { User } from 'src/common/decorators/user.decorator';

@ApiTags('Platform Admin App Version')
@Controller('v1/platform/app-version')
export class AppVersionController {
  constructor(
    private readonly appVersionService: AppVersionService,
    private readonly prisma: PrismaService,
  ) {}

  private async adminName(id: string): Promise<string> {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id },
      select: { name: true },
    });
    return admin?.name ?? 'Unknown admin';
  }

  @Get('public')
  @ApiOperation({
    summary: 'Get current app version config (used by mobile apps)',
  })
  @ApiResponse({ status: 200, description: 'Return app version config' })
  async getPublicConfig() {
    const result = await this.appVersionService.getConfig();
    return {
      success: true,
      data: result,
    };
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin', 'system_manager')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get app version config' })
  @ApiResponse({ status: 200, description: 'Return app version config' })
  async getConfig() {
    const result = await this.appVersionService.getConfig();
    return {
      success: true,
      data: result,
    };
  }

  @Patch()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin', 'system_manager')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update app version config' })
  @ApiResponse({
    status: 200,
    description: 'App version config updated successfully',
  })
  async update(
    @Body() dto: UpdateAppVersionDto,
    @User() admin: { id: string; email: string },
  ) {
    const result = await this.appVersionService.update(
      dto,
      admin.id,
      await this.adminName(admin.id),
    );
    return {
      success: true,
      data: result,
      message: 'App version config updated successfully',
    };
  }
}
