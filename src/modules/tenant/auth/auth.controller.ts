import { Controller, Post, Body, Res, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Response, Request } from 'express';
import { TenantAuthService } from './auth.service';
import { TenantLoginDto, RequestOtpDto, ResetPasswordDto } from './dto';

interface RequestWithCookies extends Request {
  cookies: {
    refreshToken?: string;
  };
}

@ApiTags('Tenant Auth')
@Controller('v1/tenant/auth')
export class TenantAuthController {
  constructor(private readonly authService: TenantAuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Tenant login' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  async login(@Body() dto: TenantLoginDto, @Res() res: Response) {
    const result = await this.authService.login(dto);

    res.cookie('refreshToken', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      data: {
        accessToken: result.accessToken,
        tenant: result.tenant,
        mustResetPassword: result.mustResetPassword,
      },
    });
  }

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

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  async refresh(@Req() req: RequestWithCookies, @Res() res: Response) {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token not found',
      });
    }

    const result = await this.authService.refresh(refreshToken);

    return res.json({
      success: true,
      data: result,
    });
  }
}
