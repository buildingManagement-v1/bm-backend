import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
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
import { OtpType, Prisma, UserType } from 'generated/prisma/client';
import {
  AuthTokenPayload,
  issuedBeforePasswordChange,
  signAccessToken,
  signAuthTokens,
  verifyRefreshToken,
} from 'src/common/token/auth-tokens';

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

    const { accessToken, refreshToken } = signAuthTokens(
      this.jwtService,
      this.payloadFor(admin),
      '7d',
    );

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

  async createAdmin(dto: CreateAdminDto, actorId: string) {
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

    await this.audit('create', admin.id, actorId, {
      email: dto.email,
      roles: dto.roles,
    });
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

  async updateAdmin(id: string, dto: UpdateAdminDto, actorId: string) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    if (dto.email && dto.email !== admin.email) {
      const taken = await this.prisma.platformAdmin.findUnique({
        where: { email: dto.email },
      });
      if (taken) {
        throw new ConflictException('Email already exists');
      }
    }

    const losesSuperAdmin =
      admin.roles.includes('super_admin') &&
      ((dto.roles && !dto.roles.includes('super_admin')) ||
        dto.status === 'inactive');
    if (losesSuperAdmin) {
      if (id === actorId) {
        throw new BadRequestException(
          'You cannot remove your own super admin access',
        );
      }
      await this.assertAnotherActiveSuperAdmin(id);
    }

    const updateData: {
      name?: string;
      email?: string;
      roles?: PlatformAdminRole[];
      status?: AdminStatus;
    } = {};

    if (dto.name) updateData.name = dto.name;
    if (dto.email) updateData.email = dto.email;
    if (dto.roles) updateData.roles = dto.roles;
    if (dto.status) updateData.status = dto.status;

    const passwordData = dto.password
      ? {
          passwordHash: await bcrypt.hash(dto.password, 10),
          passwordChangedAt: new Date(),
          // A password set by someone else must be replaced at next login
          mustResetPassword: id !== actorId,
        }
      : {};

    const updated = await this.prisma.platformAdmin.update({
      where: { id },
      data: { ...updateData, ...passwordData },
      select: {
        id: true,
        name: true,
        email: true,
        roles: true,
        status: true,
      },
    });

    await this.audit('update', id, actorId, {
      email: updated.email,
      changes: {
        name: dto.name,
        email: dto.email,
        roles: dto.roles,
        status: dto.status,
        passwordReset: dto.password ? true : undefined,
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

    const updated = await this.prisma.platformAdmin.update({
      where: { id: adminId },
      data: {
        passwordHash: hashedPassword,
        mustResetPassword: false,
        passwordChangedAt: new Date(),
      },
    });

    // Older sessions are revoked by passwordChangedAt; hand this one new tokens
    return {
      message: 'Password changed successfully',
      ...signAuthTokens(this.jwtService, this.payloadFor(updated), '7d'),
    };
  }

  async deleteAdmin(id: string, actorId: string) {
    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    if (id === actorId) {
      throw new BadRequestException('You cannot delete your own account');
    }

    if (admin.roles.includes('super_admin')) {
      await this.assertAnotherActiveSuperAdmin(id);
    }

    await this.prisma.platformAdmin.delete({
      where: { id },
    });

    await this.audit('delete', id, actorId, { email: admin.email });

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
        mustResetPassword: false,
      },
    });

    return { message: 'Password reset successfully' };
  }

  async refresh(refreshToken: string) {
    const payload = verifyRefreshToken(this.jwtService, refreshToken);
    if (payload.type !== 'platform') {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const admin = await this.prisma.platformAdmin.findUnique({
      where: { id: payload.sub },
    });

    if (
      !admin ||
      admin.status === 'inactive' ||
      issuedBeforePasswordChange(payload.iat, admin.passwordChangedAt)
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return {
      accessToken: signAccessToken(this.jwtService, this.payloadFor(admin)),
    };
  }

  private payloadFor(admin: {
    id: string;
    email: string;
    roles: PlatformAdminRole[];
  }): AuthTokenPayload {
    return {
      sub: admin.id,
      email: admin.email,
      role: 'platform_admin',
      roles: admin.roles,
      type: 'platform',
    };
  }

  private async audit(
    action: 'create' | 'update' | 'delete',
    entityId: string,
    actorId: string,
    details: Record<string, unknown>,
  ) {
    const actor = await this.prisma.platformAdmin.findUnique({
      where: { id: actorId },
      select: { name: true },
    });
    await this.prisma.platformActivityLog.create({
      data: {
        action,
        entityType: 'platform_admin',
        entityId,
        adminId: actorId,
        adminName: actor?.name ?? 'Unknown admin',
        details: details as Prisma.InputJsonValue,
      },
    });
  }

  private async assertAnotherActiveSuperAdmin(excludeId: string) {
    const others = await this.prisma.platformAdmin.count({
      where: {
        id: { not: excludeId },
        status: 'active',
        roles: { has: 'super_admin' },
      },
    });
    if (others === 0) {
      throw new BadRequestException(
        'At least one active super admin must remain',
      );
    }
  }
}
