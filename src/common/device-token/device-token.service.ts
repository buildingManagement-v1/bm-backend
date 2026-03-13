import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserType, PushPlatform } from 'generated/prisma/client';

@Injectable()
export class DeviceTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async register(
    userId: string,
    userType: UserType,
    token: string,
    platform: PushPlatform,
  ) {
    await this.prisma.deviceToken.upsert({
      where: {
        userId_userType_token: { userId, userType, token },
      },
      create: { userId, userType, token, platform },
      update: { platform, updatedAt: new Date() },
    });
    return { registered: true };
  }

  async unregister(userId: string, userType: UserType, token: string) {
    await this.prisma.deviceToken.deleteMany({
      where: { userId, userType, token },
    });
    return { unregistered: true };
  }

  async getTokensByUser(userId: string, userType: UserType) {
    return this.prisma.deviceToken.findMany({
      where: { userId, userType },
      select: { token: true, platform: true },
    });
  }

  async deleteByToken(token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { token } });
  }
}
