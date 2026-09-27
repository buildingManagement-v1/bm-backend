import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ManagerRole } from 'generated/prisma/client';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { BuildingAccessGuard } from 'src/common/guards/building-access.guard';
import { SubscriptionGuard } from 'src/common/guards/subscription.guard';
import { ManagerRolesGuard } from 'src/common/guards/manager-roles.guard';
import { TenantGuard } from 'src/common/guards/user-type.guards';
import { RequireManagerRoles } from 'src/common/decorators/require-manager-roles.decorator';
import { BuildingId } from 'src/common/decorators/building-id.decorator';
import { User } from 'src/common/decorators/user.decorator';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto, UpdateAnnouncementDto } from './dto';

function page(limit?: string, offset?: string) {
  return {
    limit: Math.min(100, Math.max(1, Number(limit) || 20)),
    offset: Math.max(0, Number(offset) || 0),
  };
}

@ApiTags('Announcements')
@ApiBearerAuth()
@Controller('v1/app/announcements')
@UseGuards(JwtAuthGuard, BuildingAccessGuard, SubscriptionGuard)
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Post()
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(
    ManagerRole.operations_manager,
    ManagerRole.tenant_manager,
  )
  @ApiOperation({ summary: 'Create (and by default publish) an announcement' })
  @ApiResponse({ status: 201, description: 'Announcement created' })
  async create(
    @BuildingId() buildingId: string,
    @Body() dto: CreateAnnouncementDto,
    @User() user: { id: string; role: string },
  ) {
    const data = await this.announcementsService.create(buildingId, dto, user);
    return {
      success: true,
      data,
      message: data.publishedAt
        ? 'Announcement published'
        : 'Announcement saved as draft',
    };
  }

  @Get()
  @ApiOperation({ summary: 'List announcements (drafts included)' })
  async findAll(
    @BuildingId() buildingId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('q') q?: string,
  ) {
    const { items, pageInfo } = await this.announcementsService.findAll(
      buildingId,
      { ...page(limit, offset), q },
    );
    return { success: true, data: items, meta: { page_info: pageInfo } };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an announcement' })
  async findOne(
    @BuildingId() buildingId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return {
      success: true,
      data: await this.announcementsService.findOne(buildingId, id),
    };
  }

  @Patch(':id')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(
    ManagerRole.operations_manager,
    ManagerRole.tenant_manager,
  )
  @ApiOperation({ summary: 'Edit an announcement' })
  async update(
    @BuildingId() buildingId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAnnouncementDto,
    @User() user: { id: string; role: string },
  ) {
    return {
      success: true,
      data: await this.announcementsService.update(buildingId, id, dto, user),
      message: 'Announcement updated',
    };
  }

  @Post(':id/publish')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(
    ManagerRole.operations_manager,
    ManagerRole.tenant_manager,
  )
  @ApiOperation({ summary: 'Publish a draft and notify tenants' })
  async publish(
    @BuildingId() buildingId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @User() user: { id: string; role: string },
  ) {
    return {
      success: true,
      data: await this.announcementsService.publish(buildingId, id, user),
      message: 'Announcement published',
    };
  }

  @Delete(':id')
  @UseGuards(ManagerRolesGuard)
  @RequireManagerRoles(
    ManagerRole.operations_manager,
    ManagerRole.tenant_manager,
  )
  @ApiOperation({ summary: 'Delete an announcement' })
  async remove(
    @BuildingId() buildingId: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @User() user: { id: string; role: string },
  ) {
    return {
      success: true,
      data: await this.announcementsService.remove(buildingId, id, user),
    };
  }
}

@ApiTags('Tenant Portal')
@ApiBearerAuth()
@Controller('v1/tenant/announcements')
@UseGuards(JwtAuthGuard, TenantGuard)
export class TenantAnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get()
  @ApiOperation({ summary: "My building's current announcements" })
  async findAll(
    @User() user: { id: string },
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const { items, pageInfo } = await this.announcementsService.listForTenant(
      user.id,
      page(limit, offset),
    );
    return { success: true, data: items, meta: { page_info: pageInfo } };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one announcement' })
  async findOne(
    @User() user: { id: string },
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return {
      success: true,
      data: await this.announcementsService.findOneForTenant(user.id, id),
    };
  }
}
