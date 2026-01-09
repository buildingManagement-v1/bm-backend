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

  get unit() {
    return this.client.unit;
  }

  get tenant() {
    return this.client.tenant;
  }

  get lease() {
    return this.client.lease;
  }

  get maintenanceRequest() {
    return this.client.maintenanceRequest;
  }

  get payment() {
    return this.client.payment;
  }

  get invoice() {
    return this.client.invoice;
  }

  get paymentPeriod() {
    return this.client.paymentPeriod;
  }

  get activityLog() {
    return this.client.activityLog;
  }

  get platformActivityLog() {
    return this.client.platformActivityLog;
  }

  get announcement() {
    return this.client.announcement;
  }

  get utilityReading() {
    return this.client.utilityReading;
  }

  get managerBuildingRole() {
    return this.client.managerBuildingRole;
  }

  get subscriptionHistory() {
    return this.client.subscriptionHistory;
  }

  get subscription() {
    return this.client.subscription;
  }

  get subscriptionPlan() {
    return this.client.subscriptionPlan;
  }

  $transaction<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.client.$transaction(fn);
  }

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }
}
