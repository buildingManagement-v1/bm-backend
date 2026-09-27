import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthRateLimit } from 'src/common/throttle/throttle.constants';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { TenantAuthService } from './auth.service';
import {
  TenantLoginDto,
  RequestOtpDto,
  ResetPasswordDto,
  ChangePasswordDto,
} from './dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { User } from '../../../common/decorators/user.decorator';
import { TenantGuard } from 'src/common/guards/user-type.guards';

interface RequestWithCookies extends Request {
  cookies: {
    refreshToken?: string;
  };
}

@ApiTags('Tenant Auth')
@Controller('v1/tenant/auth')
export class TenantAuthController {
  constructor(private readonly authService: TenantAuthService) {}

  @AuthRateLimit()
  @Post('login')
  @ApiOperation({ summary: 'Tenant login' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  async login(@Body() dto: TenantLoginDto) {
    const result = await this.authService.login(dto);
    return {
      success: true,
      data: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        tenant: result.tenant,
        mustResetPassword: result.mustResetPassword,
      },
    };
  }

  @AuthRateLimit()
  @Post('request-otp')
  @ApiOperation({ summary: 'Request password reset OTP' })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  async requestOtp(@Body() dto: RequestOtpDto) {
    const result = await this.authService.requestOtp(dto);
    return {
      success: true,
      message: result.message,
    };
  }

  @AuthRateLimit()
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with OTP' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const result = await this.authService.resetPassword(dto);
    return {
      success: true,
      message: result.message,
    };
  }

  @AuthRateLimit()
  @Post('change-password')
  @UseGuards(JwtAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  async changePassword(
    @User() user: { id: string },
    @Body() dto: ChangePasswordDto,
  ) {
    const result = await this.authService.changePassword(user.id, dto);
    return {
      success: true,
      message: result.message,
    };
  }

  @AuthRateLimit()
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  async refresh(
    @Body() body: { refreshToken?: string },
    @Req() req: RequestWithCookies,
  ) {
    const token = body?.refreshToken ?? req.cookies?.refreshToken;
    if (!token) {
      throw new UnauthorizedException('Refresh token not found');
    }
    const result = await this.authService.refresh(token);
    return {
      success: true,
      data: result,
    };
  }
}
