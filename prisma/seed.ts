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
      buildingPrice: 0,
      managerPrice: 0,
      features: {
        maxBuildings: 1,
        maxManagers: 1,
        maxUnits: 10,
        support: 'Email',
      },
      status: 'active',
    },
  });

  const proPlan = await prisma.subscriptionPlan.upsert({
    where: { name: 'Pro' },
    update: {},
    create: {
      name: 'Pro',
      buildingPrice: 99.99,
      managerPrice: 29.99,
      features: {
        maxBuildings: 999,
        maxManagers: 999,
        maxUnits: 999,
        support: 'Priority Phone & Email',
      },
      status: 'active',
    },
  });

  console.log('Free plan created:', freePlan);
  console.log('Pro plan created:', proPlan);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
