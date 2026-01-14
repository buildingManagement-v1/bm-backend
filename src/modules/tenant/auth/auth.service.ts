import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { TenantLoginDto, RequestOtpDto, ResetPasswordDto } from './dto';
import { TokenService } from '../../../common/token/token.service';
import { EmailService } from '../../../common/email/email.service';
import { OtpType, UserType } from 'generated/prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class TenantAuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private tokenService: TokenService,
    private emailService: EmailService,
  ) {}

  async login(dto: TenantLoginDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { email: dto.email },
      include: {
        building: {
          select: {
            id: true,
            name: true,
          },
        },
        unit: {
          select: {
            id: true,
            unitNumber: true,
            floor: true,
          },
        },
      },
    });

    if (!tenant) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (tenant.status === 'inactive') {
      throw new UnauthorizedException('Account is inactive');
    }

    if (!tenant.passwordHash) {
      throw new UnauthorizedException(
        'Password not set. Please contact building management.',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      tenant.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: { lastLoginAt: new Date() },
    });

    const payload = {
      sub: tenant.id,
      email: tenant.email,
      role: 'tenant',
      type: 'tenant',
      buildingId: tenant.buildingId,
      unitId: tenant.unitId,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    return {
      accessToken,
      refreshToken,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        building: tenant.building,
        unit: tenant.unit,
      },
      mustResetPassword: tenant.mustResetPassword,
    };
  }

  async requestOtp(dto: RequestOtpDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { email: dto.email },
    });

    if (!tenant) {
      return { message: 'If email exists, OTP has been sent' };
    }

    const otp = await this.tokenService.createOTP(
      tenant.id,
      UserType.tenant,
      OtpType.password_reset,
      10,
    );

    await this.emailService.sendTenantPasswordResetEmail(tenant.email, otp);

    return { message: 'If email exists, OTP has been sent' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { email: dto.email },
    });

    if (!tenant) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.tokenService.validateOTP(
      dto.otp,
      tenant.id,
      OtpType.password_reset,
    );

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        passwordHash: hashedPassword,
        passwordChangedAt: new Date(),
        mustResetPassword: false,
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
        buildingId: string;
        unitId: string | null;
      }>(refreshToken);

      const tenant = await this.prisma.tenant.findUnique({
        where: { id: payload.sub },
      });

      if (!tenant || tenant.status === 'inactive') {
        throw new UnauthorizedException('Invalid token');
      }

      const newPayload = {
        sub: tenant.id,
        email: tenant.email,
        role: 'tenant',
        type: 'tenant',
        buildingId: tenant.buildingId,
        unitId: tenant.unitId,
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
