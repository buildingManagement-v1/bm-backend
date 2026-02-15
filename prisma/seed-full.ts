/**
 * Full test data seed.
 * Run after the default seed so subscription plans exist:
 *   npx prisma db seed     (runs prisma/seed.ts)
 *   npm run seed:full      (runs this file)
 * Does not remove or replace existing seed data.
 * All passwords: Asdf@#1234
 */
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

const TEST_PASSWORD = 'Asdf@#1234';

function addMonths(d: Date, months: number): Date {
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

function monthString(d: Date): string {
  return d.toISOString().slice(0, 7); // YYYY-MM
}

async function main() {
  const hashedPassword = await bcrypt.hash(TEST_PASSWORD, 10);

  // Ensure plans exist (from main seed)
  const freePlan = await prisma.subscriptionPlan.findFirst({
    where: { name: { equals: 'Free', mode: 'insensitive' } },
  });
  const proPlan = await prisma.subscriptionPlan.findFirst({
    where: { name: { equals: 'Pro', mode: 'insensitive' } },
  });
  if (!freePlan || !proPlan) {
    throw new Error(
      'Run the default seed first (npm run seed) to create subscription plans.',
    );
  }

  // ---------- 3 owner users ----------
  const owner1 = await prisma.user.upsert({
    where: { email: 'owner1@test.com' },
    update: {},
    create: {
      name: 'Abebe Kebede',
      email: 'owner1@test.com',
      passwordHash: hashedPassword,
      phone: '+251911111111',
      status: 'active',
    },
  });
  const owner2 = await prisma.user.upsert({
    where: { email: 'owner2@test.com' },
    update: {},
    create: {
      name: 'Tigist Hailu',
      email: 'owner2@test.com',
      passwordHash: hashedPassword,
      phone: '+251922222222',
      status: 'active',
    },
  });
  const owner3 = await prisma.user.upsert({
    where: { email: 'owner3@test.com' },
    update: {},
    create: {
      name: 'Dawit Bekele',
      email: 'owner3@test.com',
      passwordHash: hashedPassword,
      phone: '+251933333333',
      status: 'active',
    },
  });
  console.log(
    'Users created/updated:',
    owner1.email,
    owner2.email,
    owner3.email,
  );

  // ---------- Subscriptions (Pro plan, 1 year) ----------
  const cycleStart = new Date();
  cycleStart.setDate(1);
  cycleStart.setHours(0, 0, 0, 0);
  const cycleEnd = addMonths(cycleStart, 12);
  const nextBilling = new Date(cycleEnd);

  for (const user of [owner1, owner2, owner3]) {
    const existing = await prisma.subscription.findFirst({
      where: { userId: user.id, status: 'active' },
    });
    if (!existing) {
      const sub = await prisma.subscription.create({
        data: {
          userId: user.id,
          planId: proPlan.id,
          totalAmount: Number(proPlan.price),
          billingCycleStart: cycleStart,
          billingCycleEnd: cycleEnd,
          nextBillingDate: nextBilling,
          status: 'active',
        },
      });
      await prisma.subscriptionHistory.create({
        data: {
          userId: user.id,
          subscriptionId: sub.id,
          action: 'created',
          newPlanId: proPlan.id,
        },
      });
    }
  }
  console.log('Subscriptions ensured for owners.');

  // ---------- Buildings ----------
  const buildingsData: {
    userId: string;
    name: string;
    address: string;
    city: string;
    country: string;
  }[] = [
    {
      userId: owner1.id,
      name: 'Bole Heights',
      address: 'Bole Road, near Edna Mall',
      city: 'Addis Ababa',
      country: 'Ethiopia',
    },
    {
      userId: owner1.id,
      name: 'Kazanchis Tower',
      address: 'Kazanchis, Africa Ave',
      city: 'Addis Ababa',
      country: 'Ethiopia',
    },
    {
      userId: owner2.id,
      name: 'CMC Plaza',
      address: 'CMC area, Jemo',
      city: 'Addis Ababa',
      country: 'Ethiopia',
    },
    {
      userId: owner2.id,
      name: 'Sarbet Residences',
      address: 'Sarbet, behind Bole Medhanialem',
      city: 'Addis Ababa',
      country: 'Ethiopia',
    },
    {
      userId: owner3.id,
      name: 'Piassa Commercial',
      address: 'Piassa, Churchill Ave',
      city: 'Addis Ababa',
      country: 'Ethiopia',
    },
  ];

  const buildings: { id: string; userId: string; name: string }[] = [];
  for (const b of buildingsData) {
    const existing = await prisma.building.findFirst({
      where: { userId: b.userId, name: b.name },
    });
    if (existing) {
      buildings.push({
        id: existing.id,
        userId: existing.userId,
        name: existing.name,
      });
    } else {
      const created = await prisma.building.create({
        data: {
          userId: b.userId,
          name: b.name,
          address: b.address,
          city: b.city,
          country: b.country,
          contactEmail: b.userId === owner1.id ? 'bole@test.com' : undefined,
          contactPhone: '+251111000000',
          status: 'active',
        },
      });
      buildings.push({
        id: created.id,
        userId: created.userId,
        name: created.name,
      });
    }
  }
  const [boleHeights, kazanchisTower, cmcPlaza, sarbetRes, piassaComm] =
    buildings;
  console.log('Buildings created/ensured:', buildings.length);

  // ---------- Managers (some with multiple buildings) ----------
  const managersData = [
    { email: 'manager1@test.com', name: 'Manager One', phone: '+251941111111' },
    { email: 'manager2@test.com', name: 'Manager Two', phone: '+251942222222' },
    {
      email: 'manager3@test.com',
      name: 'Manager Three',
      phone: '+251943333333',
    },
    {
      email: 'manager4@test.com',
      name: 'Manager Four',
      phone: '+251944444444',
    },
  ];

  const managers: { id: string; email: string }[] = [];
  const ownerForManager = [owner1.id, owner1.id, owner2.id, owner3.id]; // m1,m2 -> owner1; m3 -> owner2; m4 -> owner3
  for (let mi = 0; mi < managersData.length; mi++) {
    const m = managersData[mi];
    const mgr = await prisma.manager.upsert({
      where: { email: m.email },
      update: {},
      create: {
        userId: ownerForManager[mi],
        name: m.name,
        email: m.email,
        passwordHash: hashedPassword,
        phone: m.phone,
        status: 'active',
        mustResetPassword: false,
      },
    });
    managers.push({ id: mgr.id, email: mgr.email });
  }
  const [m1, m2, m3, m4] = managers;
  console.log('Managers created/updated:', managers.length);

  // ManagerBuildingRole: m1 -> Bole + Kazanchis; m2 -> Bole only; m3 -> Kazanchis + CMC; m4 -> CMC + Sarbet + Piassa
  const roleAssignments: {
    managerId: string;
    buildingId: string;
    roles: (
      | 'tenant_manager'
      | 'payment_manager'
      | 'maintenance_manager'
      | 'operations_manager'
      | 'reports_viewer'
    )[];
  }[] = [
    {
      managerId: m1.id,
      buildingId: boleHeights.id,
      roles: ['tenant_manager', 'payment_manager', 'reports_viewer'],
    },
    {
      managerId: m1.id,
      buildingId: kazanchisTower.id,
      roles: ['payment_manager', 'reports_viewer'],
    },
    {
      managerId: m2.id,
      buildingId: boleHeights.id,
      roles: ['maintenance_manager', 'operations_manager'],
    },
    {
      managerId: m3.id,
      buildingId: kazanchisTower.id,
      roles: ['tenant_manager', 'maintenance_manager'],
    },
    {
      managerId: m3.id,
      buildingId: cmcPlaza.id,
      roles: ['operations_manager', 'reports_viewer'],
    },
    {
      managerId: m4.id,
      buildingId: cmcPlaza.id,
      roles: ['tenant_manager', 'payment_manager'],
    },
    {
      managerId: m4.id,
      buildingId: sarbetRes.id,
      roles: ['payment_manager', 'maintenance_manager', 'reports_viewer'],
    },
    {
      managerId: m4.id,
      buildingId: piassaComm.id,
      roles: ['operations_manager'],
    },
  ];

  for (const ra of roleAssignments) {
    await prisma.managerBuildingRole.upsert({
      where: {
        managerId_buildingId: {
          managerId: ra.managerId,
          buildingId: ra.buildingId,
        },
      },
      update: { roles: ra.roles },
      create: {
        managerId: ra.managerId,
        buildingId: ra.buildingId,
        roles: ra.roles,
      },
    });
  }
  console.log('Manager-building roles assigned.');

  // ---------- Units (per building) ----------
  const unitRows: {
    buildingId: string;
    unitNumber: string;
    floor: number;
    rentPrice: number;
    type: 'retail' | 'office' | 'other';
  }[] = [];
  const buildingIds = buildings.map((b) => b.id);
  const unitNumbers = ['101', '102', '201', '202', '301', '302', '401', '501'];
  for (const buildingId of buildingIds) {
    for (let i = 0; i < unitNumbers.length; i++) {
      const un = unitNumbers[i];
      const floor = Math.floor(i / 2) + 1;
      const rentPrice =
        8000 + (floor - 1) * 2000 + Math.floor(Math.random() * 1000);
      const type: 'retail' | 'office' | 'other' =
        i % 3 === 0 ? 'retail' : i % 3 === 1 ? 'office' : 'other';
      unitRows.push({ buildingId, unitNumber: un, floor, rentPrice, type });
    }
  }

  const unitsCreated: {
    id: string;
    buildingId: string;
    unitNumber: string;
    rentPrice: number;
  }[] = [];
  for (const u of unitRows) {
    const existing = await prisma.unit.findUnique({
      where: {
        buildingId_unitNumber: {
          buildingId: u.buildingId,
          unitNumber: u.unitNumber,
        },
      },
    });
    if (existing) {
      unitsCreated.push({
        id: existing.id,
        buildingId: existing.buildingId,
        unitNumber: existing.unitNumber,
        rentPrice: Number(existing.rentPrice),
      });
    } else {
      const created = await prisma.unit.create({
        data: {
          buildingId: u.buildingId,
          unitNumber: u.unitNumber,
          floor: u.floor,
          rentPrice: u.rentPrice,
          type: u.type,
          status: 'vacant',
        },
      });
      unitsCreated.push({
        id: created.id,
        buildingId: created.buildingId,
        unitNumber: created.unitNumber,
        rentPrice: Number(created.rentPrice),
      });
    }
  }
  console.log('Units created/ensured:', unitsCreated.length);

  // ---------- Tenants (unique emails) ----------
  let tenantIndex = 0;
  function nextTenantEmail() {
    tenantIndex += 1;
    return `tenant${tenantIndex}@test.com`;
  }

  const tenantsByBuilding = new Map<
    string,
    { id: string; buildingId: string; name: string; email: string }[]
  >();
  for (const b of buildings) {
    const count = 4 + Math.floor(Math.random() * 3); // 4–6 tenants per building
    const list: {
      id: string;
      buildingId: string;
      name: string;
      email: string;
    }[] = [];
    for (let i = 0; i < count; i++) {
      const email = nextTenantEmail();
      const names = [
        'Sara Ahmed',
        'Yonas Desta',
        'Meron Tesfaye',
        'Habtamu Girma',
        'Ephrem Tadesse',
        'Helen Getachew',
        'Kaleb Abebe',
        'Dina Mohammed',
      ];
      const name = names[(tenantIndex - 1) % names.length] + ` ${tenantIndex}`;
      const tenant = await prisma.tenant.upsert({
        where: { email },
        update: {},
        create: {
          buildingId: b.id,
          name,
          email,
          phone: `+25197${String(tenantIndex).padStart(6, '0')}`,
          passwordHash: hashedPassword,
          status: 'active',
        },
      });
      list.push({
        id: tenant.id,
        buildingId: b.id,
        name: tenant.name,
        email: tenant.email,
      });
    }
    tenantsByBuilding.set(b.id, list);
  }
  console.log('Tenants created/updated.');

  // ---------- Leases (assign tenants to units; some units stay vacant) ----------
  const leasesCreated: {
    id: string;
    tenantId: string;
    unitId: string;
    buildingId: string;
    rentAmount: number;
    startDate: Date;
    endDate: Date;
  }[] = [];
  let invoiceCounter = 1000;

  for (const b of buildings) {
    const tenants = tenantsByBuilding.get(b.id) || [];
    const buildingUnits = unitsCreated.filter((u) => u.buildingId === b.id);
    const occupiedCount = Math.min(tenants.length, buildingUnits.length - 1); // leave at least 1 vacant
    for (let i = 0; i < occupiedCount; i++) {
      const tenant = tenants[i];
      const unit = buildingUnits[i];
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - (i % 6)); // spread start dates
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
      const endDate = addMonths(startDate, 12);
      const rentAmount = unit.rentPrice;

      const existingLease = await prisma.lease.findFirst({
        where: { unitId: unit.id, status: 'active' },
      });
      if (existingLease) continue;

      const lease = await prisma.lease.create({
        data: {
          tenantId: tenant.id,
          unitId: unit.id,
          buildingId: b.id,
          startDate,
          endDate,
          rentAmount,
          securityDeposit: rentAmount,
          status: 'active',
        },
      });
      leasesCreated.push({
        id: lease.id,
        tenantId: tenant.id,
        unitId: unit.id,
        buildingId: b.id,
        rentAmount,
        startDate,
        endDate,
      });

      // Mark unit occupied
      await prisma.unit.update({
        where: { id: unit.id },
        data: { status: 'occupied' },
      });

      // Payment periods (last 6 months + current + next 2)
      const months: string[] = [];
      const from = new Date();
      from.setMonth(from.getMonth() - 6);
      from.setDate(1);
      for (let m = 0; m < 10; m++) {
        const d = addMonths(from, m);
        months.push(monthString(d));
      }
      for (const month of months) {
        const [y, mo] = month.split('-').map(Number);
        const periodStart = new Date(y, mo - 1, 1);
        const isPast = periodStart < new Date();
        const paid = isPast && Math.random() > 0.3; // ~70% of past periods paid
        await prisma.paymentPeriod.upsert({
          where: { leaseId_month: { leaseId: lease.id, month } },
          update: {},
          create: {
            leaseId: lease.id,
            month,
            rentAmount,
            status: paid ? 'paid' : isPast ? 'overdue' : 'unpaid',
            paidAt: paid ? addMonths(periodStart, 1) : undefined,
          },
        });
      }

      // Invoices (one per tenant for recent months)
      const invNum = `INV-${++invoiceCounter}`;
      const dueDate = addMonths(new Date(), 1);
      const inv = await prisma.invoice.create({
        data: {
          buildingId: b.id,
          unitId: unit.id,
          tenantId: tenant.id,
          invoiceNumber: invNum,
          amount: rentAmount,
          dueDate,
          status: Math.random() > 0.5 ? 'sent' : 'paid',
          items: [{ description: 'Monthly rent', amount: rentAmount }],
        },
      });

      // Some payments (rent type, some linked to invoice)
      if (Math.random() > 0.4) {
        const pay = await prisma.payment.create({
          data: {
            buildingId: b.id,
            unitId: unit.id,
            tenantId: tenant.id,
            invoiceId: inv.id,
            amount: rentAmount,
            type: 'rent',
            status: 'completed',
            paymentDate: new Date(),
            notes: 'Seed test payment',
          },
        });
        // Link one payment period to this payment
        const period = await prisma.paymentPeriod.findFirst({
          where: { leaseId: lease.id, status: 'unpaid' },
        });
        if (period) {
          await prisma.paymentPeriod.update({
            where: { id: period.id },
            data: { status: 'paid', paymentId: pay.id, paidAt: new Date() },
          });
        }
      }
    }
  }
  console.log('Leases, payment periods, invoices, and payments created.');

  // ---------- Extra invoices (overdue) for variety ----------
  for (let bi = 0; bi < buildings.length; bi++) {
    const b = buildings[bi];
    const tenants = tenantsByBuilding.get(b.id) || [];
    if (tenants.length === 0) continue;
    const t = tenants[0];
    const unit = unitsCreated.find((u) => u.buildingId === b.id);
    if (!unit) continue;
    const invNum = `INV-${2000 + bi}`;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() - 15);
    const existingInv = await prisma.invoice.findUnique({
      where: { invoiceNumber: invNum },
    });
    if (!existingInv) {
      await prisma.invoice.create({
        data: {
          buildingId: b.id,
          unitId: unit.id,
          tenantId: t.id,
          invoiceNumber: invNum,
          amount: unit.rentPrice,
          dueDate,
          status: 'overdue',
          items: [{ description: 'Rent arrears', amount: unit.rentPrice }],
        },
      });
    }
  }

  // ---------- Maintenance requests ----------
  for (const b of buildings) {
    const tenants = tenantsByBuilding.get(b.id) || [];
    const buildingUnits = unitsCreated.filter((u) => u.buildingId === b.id);
    if (tenants.length === 0 || buildingUnits.length === 0) continue;
    const priorities: ('low' | 'medium' | 'high' | 'urgent')[] = [
      'low',
      'medium',
      'high',
      'urgent',
    ];
    const statuses: ('pending' | 'in_progress' | 'completed' | 'cancelled')[] =
      ['pending', 'in_progress', 'completed', 'cancelled'];
    for (let i = 0; i < 3; i++) {
      const tenant = tenants[i % tenants.length];
      const unit = buildingUnits[i % buildingUnits.length];
      await prisma.maintenanceRequest.create({
        data: {
          buildingId: b.id,
          unitId: unit.id,
          tenantId: tenant.id,
          title: `Seed request ${i + 1}: ${i === 0 ? 'Leak' : i === 1 ? 'AC repair' : 'Door lock'}`,
          description: 'Test maintenance request for seed data.',
          priority: priorities[i],
          status: statuses[i],
          completedAt: statuses[i] === 'completed' ? new Date() : undefined,
        },
      });
    }
  }
  console.log('Maintenance requests created.');

  // ---------- Announcements ----------
  for (const b of buildings) {
    await prisma.announcement.create({
      data: {
        buildingId: b.id,
        title: 'Welcome to ' + b.name,
        content: 'This is seed test announcement content. Please ignore.',
        priority: 'normal',
        publishedAt: new Date(),
      },
    });
  }
  console.log('Announcements created.');

  console.log('\n--- Seed full completed ---');
  console.log('Owner logins (password for all: ' + TEST_PASSWORD + '):');
  console.log('  owner1@test.com, owner2@test.com, owner3@test.com');
  console.log('Manager logins (same password):');
  console.log(
    '  manager1@test.com, manager2@test.com, manager3@test.com, manager4@test.com',
  );
  console.log(
    'Tenant logins: tenant1@test.com, tenant2@test.com, ... (same password)',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
