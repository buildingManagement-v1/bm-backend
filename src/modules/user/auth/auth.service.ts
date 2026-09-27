import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  RegisterUserDto,
  LoginUserDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  UpdateEmailDto,
  DeleteAccountDto,
} from './dto';
import * as bcrypt from 'bcrypt';
import { TokenService } from 'src/common/token/token.service';
import { EmailService } from 'src/common/email/email.service';
import { SoftDeleteService } from 'src/common/soft-delete/soft-delete.service';
import { UserDeletionService } from 'src/common/user-deletion/user-deletion.service';
import { OtpType, UserType } from 'generated/prisma/client';
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
    private softDeleteService: SoftDeleteService,
    private userDeletionService: UserDeletionService,
  ) {}

  async register(dto: RegisterUserDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        passwordHash: hashedPassword,
        phone: dto.phone,
      },
    });

    // Auto-assign Free plan
    const freePlan = await this.prisma.subscriptionPlan.findFirst({
      where: {
        name: {
          equals: 'free',
          mode: 'insensitive',
        },
        status: 'active',
      },
    });

    if (!freePlan) {
      throw new InternalServerErrorException('Free plan not found');
    }

    const billingCycleStart = new Date();
    const billingCycleEnd = new Date(billingCycleStart);
    billingCycleEnd.setMonth(billingCycleEnd.getMonth() + 4); // 4 months for Free plan
    const nextBillingDate = new Date(billingCycleEnd);

    const subscription = await this.prisma.subscription.create({
      data: {
        userId: user.id,
        planId: freePlan.id,
        totalAmount: 0,
        billingCycleStart,
        billingCycleEnd,
        nextBillingDate,
        status: 'active',
      },
    });

    await this.prisma.subscriptionHistory.create({
      data: {
        userId: user.id,
        subscriptionId: subscription.id,
        action: 'created',
        newPlanId: freePlan.id,
      },
    });

    await this.emailService.sendUserRegistrationEmail(user.email, user.name);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
    };
  }

  async login(dto: LoginUserDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.deletedAt) {
      throw new UnauthorizedException(
        'This account is scheduled for deletion. Contact support to restore it.',
      );
    }

    if (user.status === 'inactive') {
      throw new UnauthorizedException('Account is inactive');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const { accessToken, refreshToken } = this.issueTokens(
      user,
      dto.rememberMe === false ? '24h' : '30d',
    );

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      mustResetPassword: user.mustResetPassword,
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || user.deletedAt) {
      return { message: 'If email exists, OTP has been sent' };
    }

    const otp = await this.tokenService.createOTP(
      user.id,
      UserType.user,
      OtpType.password_reset,
      10,
    );

    await this.emailService.sendUserPasswordResetEmail(user.email, otp);

    return { message: 'If email exists, OTP has been sent' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.tokenService.validateOTP(
      dto.otp,
      user.id,
      OtpType.password_reset,
    );

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hashedPassword,
        passwordChangedAt: new Date(),
        mustResetPassword: false,
      },
    });

    return { message: 'Password reset successfully' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );

    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: hashedPassword,
        passwordChangedAt: new Date(),
        mustResetPassword: false,
      },
    });

    // Older sessions are revoked by passwordChangedAt; hand this one new tokens
    return {
      message: 'Password changed successfully',
      ...this.issueTokens(updated, '30d'),
    };
  }

  async updateEmail(userId: string, dto: UpdateEmailDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (
      !user ||
      !(await bcrypt.compare(dto.currentPassword, user.passwordHash))
    ) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing && existing.id !== userId) {
      throw new ConflictException('Email already in use');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { email: dto.email },
    });
    return { message: 'Email updated successfully', email: dto.email };
  }

  async deleteAccount(userId: string, dto: DeleteAccountDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('User not found');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Password is incorrect');
    }

    const deletedAt = await this.softDeleteService.softDeleteUser(
      userId,
      userId,
    );
    const purgeAt = this.userDeletionService.purgeDateFor(deletedAt);

    try {
      await this.emailService.sendAccountDeletionScheduledEmail(
        user.email,
        user.name,
        purgeAt,
      );
    } catch (error) {
      console.error(error);
    }

    return {
      message: 'Account scheduled for deletion',
      purgeAt,
    };
  }

  async refresh(refreshToken: string) {
    const payload = verifyRefreshToken(this.jwtService, refreshToken);
    if (payload.type !== 'app' || payload.role !== 'owner') {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (
      !user ||
      user.status === 'inactive' ||
      user.deletedAt ||
      issuedBeforePasswordChange(payload.iat, user.passwordChangedAt)
    ) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    return {
      accessToken: signAccessToken(this.jwtService, this.payloadFor(user)),
    };
  }

  private payloadFor(user: { id: string; email: string }): AuthTokenPayload {
    return { sub: user.id, email: user.email, role: 'owner', type: 'app' };
  }

  private issueTokens(
    user: { id: string; email: string },
    refreshExpiresIn: '24h' | '30d',
  ) {
    return signAuthTokens(
      this.jwtService,
      this.payloadFor(user),
      refreshExpiresIn,
    );
  }
}
