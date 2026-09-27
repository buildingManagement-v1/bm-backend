import {
  Controller,
  Delete,
  Post,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AuthRateLimit } from 'src/common/throttle/throttle.constants';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  RegisterUserDto,
  LoginUserDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  UpdateEmailDto,
  DeleteAccountDto,
} from './dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { User } from 'src/common/decorators/user.decorator';
import { OwnerGuard } from 'src/common/guards/user-type.guards';

@ApiTags('User Auth')
@Controller('v1/app/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @AuthRateLimit()
  @Post('register')
  @ApiOperation({ summary: 'Register user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  async register(@Body() dto: RegisterUserDto) {
    const result = await this.authService.register(dto);
    return {
      success: true,
      data: result,
      message: 'Registration successful',
    };
  }

  @AuthRateLimit()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login user' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  async login(@Body() dto: LoginUserDto) {
    const result = await this.authService.login(dto);
    return {
      success: true,
      data: result,
      message: 'Login successful',
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
  @Post('change-password')
  @UseGuards(JwtAuthGuard, OwnerGuard)
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
      data: result,
    };
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard, OwnerGuard)
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

  @Delete('account')
  @UseGuards(JwtAuthGuard, OwnerGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Delete my account (soft-delete now, permanently purged after grace period)',
  })
  @ApiResponse({ status: 200, description: 'Account scheduled for deletion' })
  async deleteAccount(
    @User() user: { id: string },
    @Body() dto: DeleteAccountDto,
  ) {
    const result = await this.authService.deleteAccount(user.id, dto);
    return {
      success: true,
      data: result,
      message: result.message,
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
