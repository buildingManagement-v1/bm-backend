import {
  Controller,
  Post,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AuthRateLimit } from 'src/common/throttle/throttle.constants';
import { AuthService } from './auth.service';
import {
  LoginManagerDto,
  ChangePasswordDto,
  UpdateEmailDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { User } from '../../../common/decorators/user.decorator';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ManagerGuard } from 'src/common/guards/user-type.guards';

@ApiTags('Manager Auth')
@Controller('v1/manager/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @AuthRateLimit()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manager login' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  async login(@Body() dto: LoginManagerDto) {
    const result = await this.authService.login(dto);
    return {
      success: true,
      data: result,
      message: 'Login successful',
    };
  }

  @AuthRateLimit()
  @Post('change-password')
  @UseGuards(JwtAuthGuard, ManagerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change manager password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  async changePassword(
    @User() user: { id: string },
    @Body() dto: ChangePasswordDto,
  ) {
    const result = await this.authService.changePassword(user.id, dto);
    return {
      success: true,
      data: result,
    };
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard, ManagerGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update my email' })
  @ApiResponse({ status: 200, description: 'Email updated successfully' })
  async updateEmail(@User() user: { id: string }, @Body() dto: UpdateEmailDto) {
    const result = await this.authService.updateEmail(user.id, dto);
    return {
      success: true,
      data: result,
    };
  }

  @AuthRateLimit()
  @Post('forgot-password')
  @ApiOperation({ summary: 'Request password reset OTP' })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const result = await this.authService.forgotPassword(dto);
    return {
      success: true,
      data: result,
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
      data: result,
    };
  }

  @AuthRateLimit()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully' })
  async refresh(@Body() body: { refreshToken: string }) {
    const result = await this.authService.refresh(body.refreshToken);
    return {
      success: true,
      data: result,
      message: 'Token refreshed successfully',
    };
  }
}
