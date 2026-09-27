import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  TenantLoginDto,
  RequestOtpDto,
  ResetPasswordDto,
  ChangePasswordDto,
} from './dto';
import { TokenService } from '../../../common/token/token.service';
import { EmailService } from '../../../common/email/email.service';
import { ActivityLogsService } from '../../user/activity-logs/activity-logs.service';
import { OtpType, UserType } from 'generated/prisma/client';
import { Prisma } from 'generated/prisma/client';
import * as bcrypt from 'bcrypt';
import {
  AuthTokenPayload,
  issuedBeforePasswordChange,
  signAccessToken,
  signAuthTokens,
  verifyRefreshToken,
} from 'src/common/token/auth-tokens';

@Injectable()
export class TenantAuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private tokenService: TokenService,
    private emailService: EmailService,
    private activityLogsService: ActivityLogsService,
  ) {}

  async login(dto: TenantLoginDto) {
    const candidates = await this.prisma.tenant.findMany({
      where: {
        email: dto.email,
        deletedAt: null,
        building: { deletedAt: null },
        ...(dto.buildingId ? { buildingId: dto.buildingId } : {}),
      },
      include: {
        building: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Same email can exist in multiple buildings, each with its own password
    const matches: typeof candidates = [];
    for (const t of candidates) {
      if (!t.passwordHash || t.status === 'inactive') continue;
      if (await bcrypt.compare(dto.password, t.passwordHash)) {
        matches.push(t);
      }
    }

    if (matches.length === 0) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (matches.length > 1) {
      throw new ConflictException({
        message: 'Your account exists in more than one building. Choose one.',
        code: 'BUILDING_SELECTION_REQUIRED',
        buildings: matches.map((t) => t.building),
      });
    }

    const tenant = matches[0];

    await this.prisma.tenant.update({
      where: { id: tenant.id },
      data: { lastLoginAt: new Date() },
    });

    const { accessToken, refreshToken } = signAuthTokens(
      this.jwtService,
      this.payloadFor(tenant),
      dto.rememberMe === false ? '24h' : '30d',
    );

    return {
      accessToken,
      refreshToken,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        building: tenant.building,
      },
      mustResetPassword: tenant.mustResetPassword,
    };
  }

  async requestOtp(dto: RequestOtpDto) {
    const tenants = await this.prisma.tenant.findMany({
      where: { email: dto.email, deletedAt: null },
      select: { id: true, email: true },
    });

    if (tenants.length === 0) {
      return { message: 'If email exists, OTP has been sent' };
    }

    // One code for every building this email is a tenant in
    const otp = await this.tokenService.createOTP(
      tenants.map((t) => t.id),
      UserType.tenant,
      OtpType.password_reset,
      10,
    );

    await this.emailService.sendTenantPasswordResetEmail(tenants[0].email, otp);

    return { message: 'If email exists, OTP has been sent' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tenants = await this.prisma.tenant.findMany({
      where: { email: dto.email, deletedAt: null },
      select: { id: true },
    });

    if (tenants.length === 0) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const matchedIds = await this.tokenService.consumeOTP(
      dto.otp,
      tenants.map((t) => t.id),
      OtpType.password_reset,
    );

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.tenant.updateMany({
      where: { id: { in: matchedIds } },
      data: {
        passwordHash: hashedPassword,
        passwordChangedAt: new Date(),
        mustResetPassword: false,
      },
    });

    return { message: 'Password reset successfully' };
  }

  async changePassword(tenantId: string, dto: ChangePasswordDto) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
    });

    if (!tenant) {
      throw new UnauthorizedException('Tenant not found');
    }

    if (!tenant.passwordHash) {
      throw new UnauthorizedException(
        'Password not set. Use forgot password to set one.',
      );
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      tenant.passwordHash,
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        passwordHash: hashedPassword,
        mustResetPassword: false,
        passwordChangedAt: new Date(),
      },
    });

    await this.activityLogsService.create({
      action: 'update',
      entityType: 'tenant',
      entityId: tenantId,
      userId: tenantId,
      userName: tenant.name,
      userRole: 'tenant',
      buildingId: tenant.buildingId,
      details: { type: 'password_change' } as Prisma.InputJsonValue,
    });

    // Older sessions are revoked by passwordChangedAt; hand this one new tokens
    return {
      message: 'Password changed successfully',
      ...signAuthTokens(this.jwtService, this.payloadFor(updated), '30d'),
    };
  }

  async refresh(refreshToken: string) {
    const payload = verifyRefreshToken(this.jwtService, refreshToken);
    if (payload.type !== 'tenant') {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const tenant = await this.prisma.tenant.findFirst({
      where: { id: payload.sub, deletedAt: null },
    });

    if (
      !tenant ||
      tenant.status === 'inactive' ||
      issuedBeforePasswordChange(payload.iat, tenant.passwordChangedAt)
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return {
      accessToken: signAccessToken(this.jwtService, this.payloadFor(tenant)),
    };
  }

  private payloadFor(tenant: {
    id: string;
    email: string;
    buildingId: string;
  }): AuthTokenPayload {
    return {
      sub: tenant.id,
      email: tenant.email,
      role: 'tenant',
      type: 'tenant',
      buildingId: tenant.buildingId,
    };
  }
}
