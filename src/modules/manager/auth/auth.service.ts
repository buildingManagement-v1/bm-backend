import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  LoginManagerDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto';
import { TokenService } from '../../../common/token/token.service';
import { EmailService } from '../../../common/email/email.service';
import { OtpType, UserType } from 'generated/prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private tokenService: TokenService,
    private emailService: EmailService,
  ) {}

  async login(dto: LoginManagerDto) {
    const manager = await this.prisma.manager.findUnique({
      where: { email: dto.email },
      include: {
        buildingRoles: {
          include: {
            building: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!manager) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (manager.status === 'inactive') {
      throw new UnauthorizedException('Account is inactive');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      manager.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.manager.update({
      where: { id: manager.id },
      data: { lastLoginAt: new Date() },
    });

    const buildings = manager.buildingRoles.map((br) => br.buildingId);
    const buildingAssignments = manager.buildingRoles.map((br) => ({
      buildingId: br.buildingId,
      buildingName: br.building.name,
      roles: br.roles,
    }));

    const payload = {
      sub: manager.id,
      email: manager.email,
      role: 'manager',
      type: 'app',
      buildings,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    return {
      accessToken,
      refreshToken,
      manager: {
        id: manager.id,
        name: manager.name,
        email: manager.email,
        buildings: buildingAssignments,
      },
      mustResetPassword: manager.mustResetPassword,
    };
  }

  async changePassword(managerId: string, dto: ChangePasswordDto) {
    const manager = await this.prisma.manager.findUnique({
      where: { id: managerId },
    });

    if (!manager) {
      throw new UnauthorizedException('Manager not found');
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      manager.passwordHash,
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.manager.update({
      where: { id: managerId },
      data: {
        passwordHash: hashedPassword,
        mustResetPassword: false,
        passwordChangedAt: new Date(),
      },
    });

    return { message: 'Password changed successfully' };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const manager = await this.prisma.manager.findUnique({
      where: { email: dto.email },
    });

    if (!manager) {
      return { message: 'If email exists, OTP has been sent' };
    }

    const otp = await this.tokenService.createOTP(
      manager.id,
      UserType.manager,
      OtpType.password_reset,
      10,
    );

    await this.emailService.sendManagerPasswordResetEmail(manager.email, otp);

    return { message: 'If email exists, OTP has been sent' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const manager = await this.prisma.manager.findUnique({
      where: { email: dto.email },
    });

    if (!manager) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.tokenService.validateOTP(
      dto.otp,
      manager.id,
      OtpType.password_reset,
    );

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.manager.update({
      where: { id: manager.id },
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
        type: string;
        buildings: string[];
      }>(refreshToken);

      const manager = await this.prisma.manager.findUnique({
        where: { id: payload.sub },
        include: {
          buildingRoles: {
            select: {
              buildingId: true,
            },
          },
        },
      });

      if (!manager || manager.status === 'inactive') {
        throw new UnauthorizedException('Invalid token');
      }

      const buildings = manager.buildingRoles.map((br) => br.buildingId);

      const newPayload = {
        sub: manager.id,
        email: manager.email,
        role: 'manager',
        type: 'app',
        buildings,
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
