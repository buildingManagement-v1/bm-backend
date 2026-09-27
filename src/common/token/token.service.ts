import { Injectable, BadRequestException } from '@nestjs/common';
import { randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { OtpType, UserType } from 'generated/prisma/client';

/** Wrong guesses allowed before an OTP is burned. */
export const MAX_OTP_ATTEMPTS = 5;

@Injectable()
export class TokenService {
  constructor(private prisma: PrismaService) {}

  private generateOTP(): string {
    return randomInt(100000, 1000000).toString();
  }

  /**
   * Issues a fresh OTP. Accepts several user ids so one person with multiple
   * accounts under the same email (e.g. a tenant in two buildings) receives a
   * single code. Any earlier unused OTP of the same type is invalidated.
   */
  async createOTP(
    userId: string | string[],
    userType: UserType,
    type: OtpType,
    expiryMinutes: number = 10,
  ) {
    const userIds = Array.isArray(userId) ? userId : [userId];
    const otp = this.generateOTP();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expiryMinutes);

    await this.prisma.$transaction(async (tx) => {
      await tx.otp.updateMany({
        where: { userId: { in: userIds }, type, isUsed: false },
        data: { isUsed: true },
      });
      await tx.otp.createMany({
        data: userIds.map((id) => ({
          otp,
          type,
          userType,
          userId: id,
          expiresAt,
        })),
      });
    });

    return otp;
  }

  /**
   * Checks an OTP against the latest live code of each given user. Matching
   * codes are consumed and their user ids returned; a wrong guess counts
   * against the code and burns it after MAX_OTP_ATTEMPTS.
   */
  async consumeOTP(
    otp: string,
    userIds: string[],
    type: OtpType,
  ): Promise<string[]> {
    const now = new Date();
    const records = await this.prisma.otp.findMany({
      where: {
        userId: { in: userIds },
        type,
        isUsed: false,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Only the newest code per user is live
    const latest = new Map<string, (typeof records)[number]>();
    for (const r of records) {
      if (!latest.has(r.userId)) latest.set(r.userId, r);
    }

    if (latest.size === 0) {
      throw new BadRequestException(
        'Invalid or expired OTP. Please request a new code.',
      );
    }

    const matched = [...latest.values()].filter((r) => sameCode(r.otp, otp));

    if (matched.length === 0) {
      let exhausted = false;
      for (const r of latest.values()) {
        const attempts = r.attempts + 1;
        if (attempts >= MAX_OTP_ATTEMPTS) exhausted = true;
        await this.prisma.otp.update({
          where: { id: r.id },
          data: { attempts, isUsed: attempts >= MAX_OTP_ATTEMPTS },
        });
      }
      throw new BadRequestException(
        exhausted
          ? 'Too many incorrect attempts. Please request a new code.'
          : 'Invalid OTP',
      );
    }

    await this.prisma.otp.updateMany({
      where: { id: { in: matched.map((r) => r.id) } },
      data: { isUsed: true },
    });

    return matched.map((r) => r.userId);
  }

  async validateOTP(
    otp: string,
    userId: string,
    type: OtpType,
  ): Promise<boolean> {
    await this.consumeOTP(otp, [userId], type);
    return true;
  }

  async deleteExpiredOTPs() {
    const result = await this.prisma.otp.deleteMany({
      where: {
        OR: [{ expiresAt: { lt: new Date() } }, { isUsed: true }],
      },
    });
    return result.count;
  }
}

function sameCode(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && timingSafeEqual(x, y);
}
