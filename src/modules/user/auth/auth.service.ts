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
} from './dto';
import * as bcrypt from 'bcrypt';
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

    const payload = {
      sub: user.id,
      email: user.email,
      role: 'owner',
      type: 'app',
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
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

    if (!user) {
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

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: hashedPassword,
        passwordChangedAt: new Date(),
      },
    });

    return { message: 'Password changed successfully' };
  }

  async updateEmail(userId: string, dto: UpdateEmailDto) {
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

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<{
        sub: string;
        email: string;
        role: string;
        type: string;
      }>(refreshToken);

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || user.status === 'inactive') {
        throw new UnauthorizedException('Invalid token');
      }

      const newPayload = {
        sub: user.id,
        email: user.email,
        role: 'owner',
        type: 'app',
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
