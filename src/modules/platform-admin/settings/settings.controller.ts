import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { User } from 'src/common/decorators/user.decorator';
import { PrismaService } from 'src/prisma/prisma.service';
import { SettingsService } from './settings.service';

class UpdateSettingsDto {
  /** { "billing.paymentInstructions": "...", ... } */
  @IsObject()
  values!: Record<string, string>;
}

@ApiTags('Platform Settings')
@ApiBearerAuth()
@Controller('v1/platform/settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'billing_manager', 'system_manager')
export class SettingsController {
  constructor(
    private readonly settingsService: SettingsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Platform settings (with who may edit each)' })
  async list(@User() user: { roles: string[] }) {
    return {
      success: true,
      data: await this.settingsService.list(user.roles ?? []),
    };
  }

  @Patch()
  @ApiOperation({ summary: 'Update platform settings' })
  async update(
    @Body() dto: UpdateSettingsDto,
    @User() user: { id: string; roles: string[] },
  ) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id: user.id },
      select: { name: true },
    });
    const data = await this.settingsService.update(dto.values, {
      id: user.id,
      name: admin?.name ?? 'Unknown admin',
      roles: user.roles ?? [],
    });
    return { success: true, data, message: 'Settings saved' };
  }
}
