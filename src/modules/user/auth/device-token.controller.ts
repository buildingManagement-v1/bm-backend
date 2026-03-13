import { Body, Controller, Delete, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { DeviceTokenService } from 'src/common/device-token/device-token.service';
import {
  RegisterDeviceTokenDto,
  UnregisterDeviceTokenDto,
} from 'src/common/device-token/dto/register-device-token.dto';

@ApiTags('User Device Token')
@Controller('v1/app/device-token')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AppDeviceTokenController {
  constructor(private readonly deviceTokenService: DeviceTokenService) {}

  @Post()
  @ApiOperation({ summary: 'Register FCM device token for push notifications' })
  async register(
    @User() user: { id: string },
    @Body() dto: RegisterDeviceTokenDto,
  ) {
    return this.deviceTokenService.register(
      user.id,
      'user',
      dto.token,
      dto.platform,
    );
  }

  @Delete()
  @ApiOperation({ summary: 'Unregister FCM device token' })
  async unregister(
    @User() user: { id: string },
    @Body() dto: UnregisterDeviceTokenDto,
  ) {
    return this.deviceTokenService.unregister(user.id, 'user', dto.token);
  }
}
