import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Get, Patch, Delete, Param } from '@nestjs/common';

import { AuthService } from './auth.service';
import {
  LoginPlatformAdminDto,
  CreateAdminDto,
  UpdateAdminDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { User } from 'src/common/decorators/user.decorator';

@ApiTags('Platform Admin Auth')
@Controller('v1/platform/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Platform admin login' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  async login(@Body() dto: LoginPlatformAdminDto) {
    const result = await this.authService.login(dto);
    return {
      success: true,
      data: result,
      message: 'Login successful',
    };
  }

  @Post('admins')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create new admin' })
  @ApiResponse({ status: 201, description: 'Admin created successfully' })
  async createAdmin(@Body() dto: CreateAdminDto) {
    const result = await this.authService.createAdmin(dto);
    return {
      success: true,
      data: result,
      message: 'Admin created successfully',
    };
  }

  @Get('admins')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin', 'user_manager')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get all admins' })
  @ApiResponse({ status: 200, description: 'Return all admins' })
  async getAllAdmins() {
    const result = await this.authService.getAllAdmins();
    return {
      success: true,
      data: result,
    };
  }

  @Get('admins/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin', 'user_manager')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get admin by ID' })
  @ApiResponse({ status: 200, description: 'Return admin details' })
  async getAdminById(@Param('id') id: string) {
    const result = await this.authService.getAdminById(id);
    return {
      success: true,
      data: result,
    };
  }

  @Patch('admins/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update admin' })
  @ApiResponse({ status: 200, description: 'Admin updated successfully' })
  async updateAdmin(@Param('id') id: string, @Body() dto: UpdateAdminDto) {
    const result = await this.authService.updateAdmin(id, dto);
    return {
      success: true,
      data: result,
      message: 'Admin updated successfully',
    };
  }

  @Delete('admins/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete admin' })
  @ApiResponse({ status: 200, description: 'Admin deleted successfully' })
  async deleteAdmin(@Param('id') id: string) {
    const result = await this.authService.deleteAdmin(id);
    return {
      success: true,
      data: result,
    };
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
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
