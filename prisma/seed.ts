/**
 * Base seed: the data every environment needs to be usable.
 *   - the platform super admin (log in to platform-admin)
 *   - the subscription plans (Free trial, Pro, Enterprise)
 *
 * Idempotent: existing rows are left untouched.
 * Run with: npx prisma db seed
 * Demo data (owners, buildings, tenants, ...) lives in prisma/seed-full.ts.
 */
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

const SUPER_ADMIN_EMAIL = 'superadmin@bms.com';
const SUPER_ADMIN_PASSWORD =
  process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'SuperAdmin123!';

const PLANS = [
  {
    name: 'Free',
    price: 0,
    features: { maxBuildings: 1, maxUnits: 30, maxManagers: 5 },
  },
  {
    name: 'Pro',
    price: 499.99,
    features: { maxBuildings: 5, maxUnits: 50, maxManagers: 7 },
  },
  {
    name: 'Enterprise',
    price: 1999.99,
    features: { maxBuildings: 999999, maxUnits: 999999, maxManagers: 999999 },
  },
];

async function main() {
  const superAdmin = await prisma.platformAdmin.upsert({
    where: { email: SUPER_ADMIN_EMAIL },
    update: {},
    create: {
      name: 'Super Admin',
      email: SUPER_ADMIN_EMAIL,
      passwordHash: await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10),
      roles: ['super_admin'],
      status: 'active',
      mustResetPassword: false,
    },
    select: { email: true },
  });
  console.log('Super admin:', superAdmin.email);

  for (const plan of PLANS) {
    await prisma.subscriptionPlan.upsert({
      where: { name: plan.name },
      update: {},
      create: {
        name: plan.name,
        price: plan.price,
        features: { ...plan.features, premiumFeatures: [] },
        status: 'active',
        type: 'public',
      },
    });
  }
  console.log('Plans:', PLANS.map((p) => p.name).join(', '));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
