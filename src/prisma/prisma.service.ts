import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from 'generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private client: PrismaClient;

  constructor() {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
    });
    this.client = new PrismaClient({ adapter });
  }

  get platformAdmin() {
    return this.client.platformAdmin;
  }

  get otp() {
    return this.client.otp;
  }

  get user() {
    return this.client.user;
  }

  get manager() {
    return this.client.manager;
  }

  get building() {
    return this.client.building;
  }

  get managerBuildingRole() {
    return this.client.managerBuildingRole;
  }

  get subscriptionPlan() {
    return this.client.subscriptionPlan;
  }

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
