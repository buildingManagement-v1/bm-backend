import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { User } from 'src/common/decorators/user.decorator';
import { PrismaService } from 'src/prisma/prisma.service';
import { BroadcastsService } from './broadcasts.service';
import {
  BROADCAST_AUDIENCES,
  BroadcastAudience,
  CreateBroadcastDto,
} from './broadcasts.dto';

@ApiTags('Platform Broadcasts')
@ApiBearerAuth()
@Controller('v1/platform/broadcasts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'system_manager')
export class BroadcastsController {
  constructor(
    private readonly broadcastsService: BroadcastsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Sent broadcasts' })
  async history(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const result = await this.broadcastsService.history(
      Math.min(100, Math.max(1, Number(limit) || 20)),
      Math.max(0, Number(offset) || 0),
    );
    return { success: true, ...result };
  }

  @Get('preview')
  @ApiOperation({ summary: 'How many accounts an audience reaches' })
  async preview(@Query('audience') audience: string) {
    const valid = (BROADCAST_AUDIENCES as readonly string[]).includes(audience)
      ? (audience as BroadcastAudience)
      : 'everyone';
    return { success: true, data: await this.broadcastsService.preview(valid) };
  }

  @Post()
  @ApiOperation({
    summary: 'Send an in-app notice to owners, managers and/or tenants',
  })
  async send(@Body() dto: CreateBroadcastDto, @User() user: { id: string }) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id: user.id },
      select: { id: true, name: true },
    });
    const data = await this.broadcastsService.send(
      dto,
      admin ?? { id: user.id, name: 'Unknown admin' },
    );
    return {
      success: true,
      data,
      message: `Sent to ${data.recipients} account(s)`,
    };
  }
}
