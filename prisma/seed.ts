import { PrismaClient } from 'generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const hashedPassword = await bcrypt.hash('SuperAdmin123!', 10);

  const superAdmin = await prisma.platformAdmin.upsert({
    where: { email: 'superadmin@bms.com' },
    update: {},
    create: {
      name: 'Super Admin',
      email: 'superadmin@bms.com',
      passwordHash: hashedPassword,
      roles: ['super_admin'],
      status: 'active',
      mustResetPassword: false,
    },
  });

  console.log('Super admin created:', superAdmin);

  // Seed subscription plans
  const freePlan = await prisma.subscriptionPlan.upsert({
    where: { name: 'Free' },
    update: {},
    create: {
      name: 'Free',
      price: 0,
      features: {
        maxBuildings: 1,
        maxUnits: 30,
        maxManagers: 5,
        premiumFeatures: [],
      },
      status: 'active',
      type: 'public',
    },
  });

  const proPlan = await prisma.subscriptionPlan.upsert({
    where: { name: 'Pro' },
    update: {},
    create: {
      name: 'Pro',
      price: 499.99,
      features: {
        maxBuildings: 5,
        maxUnits: 50,
        maxManagers: 7,
        premiumFeatures: [],
      },
      status: 'active',
      type: 'public',
    },
  });

  const enterprisePlan = await prisma.subscriptionPlan.upsert({
    where: { name: 'Enterprise' },
    update: {},
    create: {
      name: 'Enterprise',
      price: 1999.99,
      features: {
        maxBuildings: 999999,
        maxUnits: 999999,
        maxManagers: 999999,
        premiumFeatures: [],
      },
      status: 'active',
      type: 'public',
    },
  });

  console.log('Free plan created:', freePlan);
  console.log('Pro plan created:', proPlan);
  console.log('Enterprise plan created:', enterprisePlan);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
