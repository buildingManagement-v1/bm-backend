import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  LoginPlatformAdminDto,
  CreateAdminDto,
  UpdateAdminDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto';
import * as bcrypt from 'bcrypt';
import { AdminStatus, PlatformAdminRole } from 'generated/prisma/enums';
import { TokenService } from 'src/common/token/token.service';
import { EmailService } from 'src/common/email/email.service';
import { OtpType, UserType } from 'generated/prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private tokenService: TokenService,
    private emailService: EmailService,
  ) {}

  async login(dto: LoginPlatformAdminDto) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { email: dto.email },
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (admin.status === 'inactive') {
      throw new UnauthorizedException('Account is inactive');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      admin.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.platformAdmin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    const payload = {
      sub: admin.id,
      email: admin.email,
      role: 'platform_admin',
      roles: admin.roles,
      type: 'platform',
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    return {
      accessToken,
      refreshToken,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        roles: admin.roles,
        mustResetPassword: admin.mustResetPassword,
      },
    };
  }

  async createAdmin(dto: CreateAdminDto) {
    const existing = await this.prisma.platformAdmin.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const admin = await this.prisma.platformAdmin.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash: hashedPassword,
        roles: dto.roles,
      },
    });

    await this.emailService.sendPlatformAdminCreatedEmail(
      admin.email,
      admin.name,
      dto.password,
    );

    return {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      roles: admin.roles,
    };
  }

  async getAllAdmins() {
    const admins = await this.prisma.platformAdmin.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        roles: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    return admins;
  }

  async getAdminById(id: string) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        roles: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    return admin;
  }

  async updateAdmin(id: string, dto: UpdateAdminDto) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    const updateData: {
      name?: string;
      email?: string;
      passwordHash?: string;
      roles?: PlatformAdminRole[];
      status?: AdminStatus;
    } = {};

    if (dto.name) updateData.name = dto.name;
    if (dto.email) updateData.email = dto.email;
    if (dto.roles) updateData.roles = dto.roles;
    if (dto.status) updateData.status = dto.status;

    if (dto.password) {
      updateData.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    const updated = await this.prisma.platformAdmin.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        roles: true,
        status: true,
      },
    });

    return updated;
  }

  async changePassword(adminId: string, dto: ChangePasswordDto) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      admin.passwordHash,
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.platformAdmin.update({
      where: { id: adminId },
      data: {
        passwordHash: hashedPassword,
        mustResetPassword: false,
        passwordChangedAt: new Date(),
      },
    });

    return { message: 'Password changed successfully' };
  }

  async deleteAdmin(id: string) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    await this.prisma.platformAdmin.delete({
      where: { id },
    });

    return { message: 'Admin deleted successfully' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { email: dto.email },
    });

    if (!admin) {
      // Don't reveal if email exists
      return { message: 'If email exists, OTP has been sent' };
    }

    const otp = await this.tokenService.createOTP(
      admin.id,
      UserType.platform_admin,
      OtpType.password_reset,
      10,
    );

    await this.emailService.sendPlatformAdminPasswordResetEmail(
      admin.email,
      otp,
    );

    return { message: 'If email exists, OTP has been sent' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { email: dto.email },
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.tokenService.validateOTP(
      dto.otp,
      admin.id,
      OtpType.password_reset,
    );

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.platformAdmin.update({
      where: { id: admin.id },
      data: {
        passwordHash: hashedPassword,
        passwordChangedAt: new Date(),
      },
    });

    return { message: 'Password reset successfully' };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<{
        sub: string;
        email: string;
        role: string;
        roles: string[];
        type: string;
      }>(refreshToken);

      const admin = await this.prisma.platformAdmin.findUnique({
        where: { id: payload.sub },
      });

      if (!admin || admin.status === 'inactive') {
        throw new UnauthorizedException('Invalid token');
      }

      const newPayload = {
        sub: admin.id,
        email: admin.email,
        role: 'platform_admin',
        roles: admin.roles,
        type: 'platform',
      };

      const accessToken = this.jwtService.sign(newPayload, {
        expiresIn: '15m',
      });

      return { accessToken };
    } catch (error) {
      console.error(error);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
