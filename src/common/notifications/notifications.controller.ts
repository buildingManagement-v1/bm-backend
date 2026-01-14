import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { QueryNotificationsDto } from './dto';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { User } from '../decorators/user.decorator';
import { UserType } from 'generated/prisma/client';

@Controller('v1/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  private mapUserType(type: string, role?: string): UserType {
    if (type === 'platform') return 'platform_admin';
    if (type === 'app') {
      if (role === 'manager') return 'manager';
      return 'user';
    }
    return type as UserType;
  }

  @Get()
  async findAll(
    @User() user: { id: string; type: string; role?: string },
    @Query() query: QueryNotificationsDto,
  ) {
    const userType = this.mapUserType(user.type, user.role);
    return await this.notificationsService.findAll(user.id, userType, query);
  }

  @Get('unread-count')
  async getUnreadCount(
    @User() user: { id: string; type: string; role?: string },
  ) {
    const userType = this.mapUserType(user.type, user.role);
    const count = await this.notificationsService.getUnreadCount(
      user.id,
      userType,
    );
    return { count };
  }

  @Patch(':id/read')
  async markAsRead(
    @Param('id') id: string,
    @User() user: { id: string; type: string; role?: string },
  ) {
    const userType = this.mapUserType(user.type, user.role);
    await this.notificationsService.markAsRead(id, user.id, userType);
    return { success: true };
  }

  @Patch('mark-all-read')
  async markAllAsRead(
    @User() user: { id: string; type: string; role?: string },
  ) {
    const userType = this.mapUserType(user.type, user.role);
    await this.notificationsService.markAllAsRead(user.id, userType);
    return { success: true };
  }

  @Delete(':id')
  async delete(
    @Param('id') id: string,
    @User() user: { id: string; type: string; role?: string },
  ) {
    const userType = this.mapUserType(user.type, user.role);
    await this.notificationsService.delete(id, user.id, userType);
    return { success: true };
  }
}
