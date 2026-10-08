/**
 * Demo data seed, built the same way the API builds it:
 *   - 3 owners (2 on Pro after an expired trial, 1 on an active Free trial)
 *   - 5 buildings with tax/collection-day settings, 8 units each
 *   - 4 managers, each scoped only to their own owner's buildings
 *   - tenants with leases whose rent cycles come from generateCycles(),
 *     every paid cycle backed by a real Payment + INV-YYYY-NNNNN receipt
 *     (tax split per rent-period.util), some cycles unpaid/overdue,
 *     one expired lease that still owes rent
 *   - parking registrations, a pending parking request, maintenance
 *     requests and announcements
 *
 * Deterministic: the same run always produces the same data (dates are
 * relative to today). Meant for a freshly reset database:
 *   npm run db:reset     (drop everything, migrate, base seed)
 *   npm run seed:full    (this file)
 * All demo passwords: Asdf@#1234
 */
import { PrismaClient } from '../generated/prisma/client';
import type { ManagerRole, UnitType } from '../generated/prisma/enums';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';
import {
  addDays,
  generateCycles,
  todayDate,
} from '../src/common/lease/lease-cycles.util';
import { computeRentTaxBreakdown } from '../src/common/tax/rent-period.util';
import { FREE_TRIAL_MONTHS } from '../src/common/plan-limits/free-plan.util';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD = 'Asdf@#1234';
const today = todayDate();

/** Same calendar day `months` months away (clamped to month end), UTC. */
function shiftMonths(d: Date, months: number, day = d.getUTCDate()): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, lastDay)));
}

// ---------------------------------------------------------------------------
// Demo layout
// ---------------------------------------------------------------------------

type PlanName = 'Pro' | 'Free';

const OWNERS: {
  key: string;
  name: string;
  email: string;
  phone: string;
  plan: PlanName;
}[] = [
  {
    key: 'o1',
    name: 'Abebe Kebede',
    email: 'owner1@test.com',
    phone: '+251911111111',
    plan: 'Pro',
  },
  {
    key: 'o2',
    name: 'Tigist Hailu',
    email: 'owner2@test.com',
    phone: '+251922222222',
    plan: 'Pro',
  },
  {
    key: 'o3',
    name: 'Dawit Bekele',
    email: 'owner3@test.com',
    phone: '+251933333333',
    plan: 'Free',
  },
];

const BUILDINGS: {
  key: string;
  owner: string;
  name: string;
  address: string;
  vatRate: number;
  withholdingRate: number;
  paymentCollectionDay: number;
  totalParkingLots: number;
  baseRent: number;
  unitTypes: UnitType[];
}[] = [
  {
    key: 'bole',
    owner: 'o1',
    name: 'Bole Heights',
    address: 'Bole Road, near Edna Mall',
    vatRate: 15,
    withholdingRate: 2,
    paymentCollectionDay: 1,
    totalParkingLots: 10,
    baseRent: 18000,
    unitTypes: [
      'retail',
      'retail',
      'office',
      'office',
      'office',
      'office',
      'restaurant',
      'storage',
    ],
  },
  {
    key: 'kazanchis',
    owner: 'o1',
    name: 'Kazanchis Tower',
    address: 'Kazanchis, Africa Ave',
    vatRate: 15,
    withholdingRate: 0,
    paymentCollectionDay: 5,
    totalParkingLots: 6,
    baseRent: 15000,
    unitTypes: [
      'retail',
      'office',
      'office',
      'office',
      'office',
      'office',
      'office',
      'storage',
    ],
  },
  {
    key: 'cmc',
    owner: 'o2',
    name: 'CMC Plaza',
    address: 'CMC area, Jemo',
    vatRate: 0,
    withholdingRate: 0,
    paymentCollectionDay: 1,
    totalParkingLots: 8,
    baseRent: 9000,
    unitTypes: [
      'retail',
      'retail',
      'retail',
      'restaurant',
      'office',
      'office',
      'storage',
      'other',
    ],
  },
  {
    key: 'sarbet',
    owner: 'o2',
    name: 'Sarbet Residences',
    address: 'Sarbet, behind Bole Medhanialem',
    vatRate: 15,
    withholdingRate: 2,
    paymentCollectionDay: 10,
    totalParkingLots: 5,
    baseRent: 12000,
    unitTypes: [
      'guest_house',
      'guest_house',
      'guest_house',
      'guest_house',
      'office',
      'office',
      'retail',
      'storage',
    ],
  },
  {
    key: 'piassa',
    owner: 'o3',
    name: 'Piassa Commercial',
    address: 'Piassa, Churchill Ave',
    vatRate: 15,
    withholdingRate: 2,
    paymentCollectionDay: 1,
    totalParkingLots: 4,
    baseRent: 11000,
    unitTypes: [
      'retail',
      'retail',
      'retail',
      'restaurant',
      'office',
      'office',
      'office',
      'storage',
    ],
  },
];

const UNIT_NUMBERS = ['101', '102', '201', '202', '301', '302', '401', '402'];

const MANAGERS: {
  owner: string;
  name: string;
  email: string;
  phone: string;
  buildings: { building: string; roles: ManagerRole[] }[];
}[] = [
  {
    owner: 'o1',
    name: 'Selam Tesfaye',
    email: 'manager1@test.com',
    phone: '+251941111111',
    buildings: [
      {
        building: 'bole',
        roles: ['tenant_manager', 'payment_manager', 'reports_viewer'],
      },
      { building: 'kazanchis', roles: ['payment_manager', 'reports_viewer'] },
    ],
  },
  {
    owner: 'o1',
    name: 'Biruk Alemu',
    email: 'manager2@test.com',
    phone: '+251942222222',
    buildings: [
      {
        building: 'bole',
        roles: ['maintenance_manager', 'operations_manager'],
      },
      {
        building: 'kazanchis',
        roles: ['tenant_manager', 'maintenance_manager'],
      },
    ],
  },
  {
    owner: 'o2',
    name: 'Hanna Wolde',
    email: 'manager3@test.com',
    phone: '+251943333333',
    buildings: [
      { building: 'cmc', roles: ['tenant_manager', 'payment_manager'] },
      { building: 'sarbet', roles: ['operations_manager', 'reports_viewer'] },
    ],
  },
  {
    owner: 'o3',
    name: 'Samuel Getachew',
    email: 'manager4@test.com',
    phone: '+251944444444',
    buildings: [
      {
        building: 'piassa',
        roles: [
          'tenant_manager',
          'payment_manager',
          'maintenance_manager',
          'operations_manager',
          'reports_viewer',
        ],
      },
    ],
  },
];

const TENANT_NAMES = [
  'Sara Ahmed',
  'Yonas Desta',
  'Meron Tesfaye',
  'Habtamu Girma',
  'Ephrem Tadesse',
  'Helen Getachew',
  'Kaleb Abebe',
  'Dina Mohammed',
  'Rahel Mekonnen',
  'Nahom Assefa',
  'Liya Solomon',
  'Bereket Yohannes',
  'Mahlet Kassa',
  'Fitsum Haile',
  'Eden Berhane',
  'Robel Negash',
  'Tsion Mulugeta',
  'Henok Worku',
  'Bethlehem Ayele',
  'Abel Tilahun',
  'Hiwot Demissie',
  'Mikias Fekadu',
  'Saron Lemma',
  'Yared Shiferaw',
  'Kidist Taye',
];

/**
 * Per building, tenant slot i leases unit i:
 *  - monthsAgo: lease starts on the collection day this many months back
 *  - midMonth:  start on the 15th instead (prorated first/last cycles)
 *  - unpaid:    how many of the most recent due cycles are left unpaid
 * Slot 4 has an expired lease with arrears in the first building and no
 * lease (inactive prospect) elsewhere.
 */
const LEASE_SLOTS: {
  monthsAgo: number;
  midMonth: boolean;
  unpaid: number;
  carsAllowed: number;
  plates: number;
  applyWithholding: boolean;
}[] = [
  {
    monthsAgo: 8,
    midMonth: false,
    unpaid: 0,
    carsAllowed: 1,
    plates: 1,
    applyWithholding: false,
  },
  {
    monthsAgo: 5,
    midMonth: false,
    unpaid: 1,
    carsAllowed: 2,
    plates: 1,
    applyWithholding: true,
  },
  {
    monthsAgo: 3,
    midMonth: true,
    unpaid: 2,
    carsAllowed: 0,
    plates: 0,
    applyWithholding: false,
  },
  {
    monthsAgo: 1,
    midMonth: false,
    unpaid: 0,
    carsAllowed: 0,
    plates: 0,
    applyWithholding: false,
  },
];

const MAINTENANCE = [
  {
    slot: 0,
    title: 'Water leak under the sink',
    description: 'Water is dripping from the pipe under the kitchen sink.',
    priority: 'high',
    status: 'pending',
  },
  {
    slot: 1,
    title: 'AC not cooling',
    description: 'The air conditioner runs but the room stays warm.',
    priority: 'medium',
    status: 'in_progress',
  },
  {
    slot: 3,
    title: 'Front door lock broken',
    description: 'The key no longer turns in the front door lock.',
    priority: 'urgent',
    status: 'completed',
  },
] as const;

// ---------------------------------------------------------------------------

interface PaymentDraft {
  tenantId: string;
  unitId: string;
  type: 'rent' | 'deposit';
  paymentDate: Date;
  baseAmount: number;
  vatAmount: number;
  withholdingAmount: number;
  totalAmount: number;
  items: { description: string; amount: number }[];
  periodIds: string[];
}

async function main() {
  const [freePlan, proPlan] = await Promise.all(
    ['Free', 'Pro'].map((name) =>
      prisma.subscriptionPlan.findUnique({ where: { name } }),
    ),
  );
  if (!freePlan || !proPlan) {
    throw new Error('Run the base seed first (npx prisma db seed).');
  }
  if (await prisma.user.findUnique({ where: { email: OWNERS[0].email } })) {
    console.log(
      'Demo data already present. Run `npm run db:reset` first for a fresh copy.',
    );
    return;
  }

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ---------- Owners + subscriptions ----------
  const owners = new Map<string, { id: string; name: string }>();
  for (const o of OWNERS) {
    const user = await prisma.user.create({
      data: {
        name: o.name,
        email: o.email,
        phone: o.phone,
        passwordHash,
        status: 'active',
      },
      select: { id: true, name: true },
    });
    owners.set(o.key, user);

    // Every owner starts on the one-time Free trial; Pro owners moved on
    // after it ran out, the Free owner is still inside it
    const trialStart =
      o.plan === 'Pro' ? shiftMonths(today, -6) : shiftMonths(today, -1);
    const trialEnd = shiftMonths(trialStart, FREE_TRIAL_MONTHS);
    const trial = await prisma.subscription.create({
      data: {
        userId: user.id,
        planId: freePlan.id,
        totalAmount: 0,
        billingCycleStart: trialStart,
        billingCycleEnd: trialEnd,
        nextBillingDate: trialEnd,
        status: o.plan === 'Pro' ? 'expired' : 'active',
      },
    });
    await prisma.subscriptionHistory.create({
      data: {
        userId: user.id,
        subscriptionId: trial.id,
        action: 'created',
        newPlanId: freePlan.id,
        notes: `${FREE_TRIAL_MONTHS}-month free trial`,
        createdAt: trialStart,
      },
    });

    if (o.plan === 'Pro') {
      const proEnd = shiftMonths(trialEnd, 12);
      const pro = await prisma.subscription.create({
        data: {
          userId: user.id,
          planId: proPlan.id,
          totalAmount: proPlan.price,
          billingCycleStart: trialEnd,
          billingCycleEnd: proEnd,
          nextBillingDate: proEnd,
          status: 'active',
        },
      });
      await prisma.subscriptionHistory.create({
        data: {
          userId: user.id,
          subscriptionId: pro.id,
          action: 'created',
          newPlanId: proPlan.id,
          createdAt: trialEnd,
        },
      });
    }
  }
  console.log('Owners + subscriptions:', owners.size);

  // ---------- Buildings + units ----------
  const buildings = new Map<
    string,
    { id: string; owner: string; config: (typeof BUILDINGS)[number] }
  >();
  const unitsByBuilding = new Map<
    string,
    { id: string; unitNumber: string }[]
  >();
  for (const b of BUILDINGS) {
    const owner = owners.get(b.owner)!;
    const building = await prisma.building.create({
      data: {
        userId: owner.id,
        name: b.name,
        address: b.address,
        city: 'Addis Ababa',
        country: 'Ethiopia',
        contactEmail: `${b.key}@test.com`,
        contactPhone: '+251111000000',
        vatRate: b.vatRate,
        withholdingRate: b.withholdingRate,
        paymentCollectionDay: b.paymentCollectionDay,
        totalParkingLots: b.totalParkingLots,
        paymentGraceDays: 5,
        status: 'active',
      },
      select: { id: true },
    });
    buildings.set(b.key, { id: building.id, owner: b.owner, config: b });

    const units: { id: string; unitNumber: string }[] = [];
    for (let i = 0; i < UNIT_NUMBERS.length; i++) {
      const floor = Math.floor(i / 2) + 1;
      units.push(
        await prisma.unit.create({
          data: {
            buildingId: building.id,
            unitNumber: UNIT_NUMBERS[i],
            floor,
            size: 40 + (i % 2) * 20,
            type: b.unitTypes[i],
            rentPrice: b.baseRent + (floor - 1) * 1500,
            status: 'vacant',
          },
          select: { id: true, unitNumber: true },
        }),
      );
    }
    unitsByBuilding.set(b.key, units);
  }
  console.log(
    'Buildings:',
    buildings.size,
    '— units:',
    buildings.size * UNIT_NUMBERS.length,
  );

  // ---------- Managers ----------
  for (const m of MANAGERS) {
    const manager = await prisma.manager.create({
      data: {
        userId: owners.get(m.owner)!.id,
        name: m.name,
        email: m.email,
        phone: m.phone,
        passwordHash,
        status: 'active',
        mustResetPassword: false,
      },
      select: { id: true },
    });
    for (const assignment of m.buildings) {
      const building = buildings.get(assignment.building)!;
      if (building.owner !== m.owner) {
        throw new Error(`${m.email} assigned to another owner's building`);
      }
      await prisma.managerBuildingRole.create({
        data: {
          managerId: manager.id,
          buildingId: building.id,
          roles: assignment.roles,
        },
      });
    }
  }
  console.log('Managers:', MANAGERS.length);

  // ---------- Tenants, leases, cycles, payments ----------
  let tenantNo = 0;
  let plateNo = 10000;
  let paymentCount = 0;
  const firstBuildingKey = BUILDINGS[0].key;

  for (const [key, building] of buildings) {
    const { config } = building;
    const units = unitsByBuilding.get(key)!;
    const owner = owners.get(building.owner)!;
    const drafts: PaymentDraft[] = [];
    const activeLeases: {
      slot: number;
      leaseId: string;
      tenantId: string;
      unitId: string;
    }[] = [];

    const createTenant = async (active: boolean) => {
      tenantNo += 1;
      return prisma.tenant.create({
        data: {
          buildingId: building.id,
          name: TENANT_NAMES[(tenantNo - 1) % TENANT_NAMES.length],
          email: `tenant${tenantNo}@test.com`,
          phone: `+2519700000${String(tenantNo).padStart(2, '0')}`,
          tin:
            tenantNo % 2 === 0
              ? `00${String(tenantNo).padStart(8, '0')}`
              : undefined,
          passwordHash,
          status: active ? 'active' : 'inactive',
        },
        select: { id: true },
      });
    };

    /** Creates the lease + its cycles and queues payments for paid ones. */
    const createLease = async (args: {
      tenantId: string;
      unitId: string;
      start: Date;
      end: Date;
      rent: number;
      unpaid: number;
      carsAllowed: number;
      applyWithholding: boolean;
      status: 'active' | 'expired';
    }) => {
      const lease = await prisma.lease.create({
        data: {
          buildingId: building.id,
          tenantId: args.tenantId,
          unitId: args.unitId,
          startDate: args.start,
          endDate: args.end,
          rentAmount: args.rent,
          securityDeposit: args.rent * 2,
          carsAllowed: args.carsAllowed,
          useDefaultPaymentDay: true,
          paymentCollectionDay: config.paymentCollectionDay,
          applyWithholding: args.applyWithholding,
          status: args.status,
        },
        select: { id: true },
      });

      const cycles = generateCycles(
        args.start,
        args.end,
        config.paymentCollectionDay,
        args.rent,
      );
      const dueCount = cycles.filter((c) => c.periodStart <= today).length;

      for (const [idx, c] of cycles.entries()) {
        const isDue = c.periodStart <= today;
        const isPaid = isDue && idx < dueCount - args.unpaid;
        const isOverdue = isDue && !isPaid && addDays(c.periodStart, 5) < today;
        const period = await prisma.paymentPeriod.create({
          data: {
            leaseId: lease.id,
            month: c.month,
            periodStart: c.periodStart,
            periodEnd: c.periodEnd,
            daysInCycle: c.daysInCycle,
            rentAmount: c.rentAmount,
            status: isOverdue ? 'overdue' : 'unpaid',
          },
          select: { id: true },
        });
        if (!isPaid) continue;

        const tax = computeRentTaxBreakdown(
          c.rentAmount,
          config.vatRate,
          config.withholdingRate,
          args.applyWithholding,
        );
        const paidOn = addDays(c.periodStart, 2);
        drafts.push({
          tenantId: args.tenantId,
          unitId: args.unitId,
          type: 'rent',
          paymentDate: paidOn < today ? paidOn : today,
          baseAmount: c.rentAmount,
          vatAmount: tax.vatAmount,
          withholdingAmount: tax.withholdingAmount,
          totalAmount: tax.totalAmount,
          items: [
            { description: 'Base Rent', amount: c.rentAmount },
            ...(tax.vatAmount > 0
              ? [
                  {
                    description: `VAT (${config.vatRate}%)`,
                    amount: tax.vatAmount,
                  },
                ]
              : []),
            ...(tax.withholdingAmount > 0
              ? [
                  {
                    description: `Withholding (${config.withholdingRate}%)`,
                    amount: -tax.withholdingAmount,
                  },
                ]
              : []),
          ],
          periodIds: [period.id],
        });
      }

      // Security deposit collected when the lease started
      drafts.push({
        tenantId: args.tenantId,
        unitId: args.unitId,
        type: 'deposit',
        paymentDate: args.start < today ? args.start : today,
        baseAmount: args.rent * 2,
        vatAmount: 0,
        withholdingAmount: 0,
        totalAmount: args.rent * 2,
        items: [{ description: 'Deposit Payment', amount: args.rent * 2 }],
        periodIds: [],
      });
      return lease;
    };

    for (const [slot, spec] of LEASE_SLOTS.entries()) {
      const unit = units[slot];
      const tenant = await createTenant(true);
      const start = shiftMonths(
        today,
        -spec.monthsAgo,
        spec.midMonth ? 15 : config.paymentCollectionDay,
      );
      const end = addDays(shiftMonths(start, 12), -1);
      const rent = config.baseRent + Math.floor(slot / 2) * 1500;
      const lease = await createLease({
        tenantId: tenant.id,
        unitId: unit.id,
        start,
        end,
        rent,
        unpaid: spec.unpaid,
        carsAllowed: spec.carsAllowed,
        applyWithholding: spec.applyWithholding && config.withholdingRate > 0,
        status: 'active',
      });
      await prisma.unit.update({
        where: { id: unit.id },
        data: { status: 'occupied', rentPrice: rent },
      });
      for (let p = 0; p < spec.plates; p++) {
        await prisma.parkingRegistration.create({
          data: {
            buildingId: building.id,
            leaseId: lease.id,
            tenantId: tenant.id,
            unitId: unit.id,
            licensePlate: `3-AA-${++plateNo}`,
          },
        });
      }
      activeLeases.push({
        slot,
        leaseId: lease.id,
        tenantId: tenant.id,
        unitId: unit.id,
      });
    }

    // Slot 4: an expired lease that still owes its last cycle (the tenant
    // stays active until it is settled; the unit is free again), or a
    // prospect tenant with no lease yet
    if (key === firstBuildingKey) {
      const tenant = await createTenant(true);
      const start = shiftMonths(today, -14, config.paymentCollectionDay);
      const end = addDays(shiftMonths(start, 12), -1);
      await createLease({
        tenantId: tenant.id,
        unitId: units[4].id,
        start,
        end,
        rent: config.baseRent + 3000,
        unpaid: 1,
        carsAllowed: 0,
        applyWithholding: false,
        status: 'expired',
      });
    } else {
      await createTenant(false);
    }

    // Receipts are numbered in payment order, per building and year
    drafts.sort((a, b) => a.paymentDate.getTime() - b.paymentDate.getTime());
    const counters = new Map<number, number>();
    for (const d of drafts) {
      const year = d.paymentDate.getUTCFullYear();
      const seq = (counters.get(year) ?? 0) + 1;
      counters.set(year, seq);
      const invoice = await prisma.invoice.create({
        data: {
          buildingId: building.id,
          tenantId: d.tenantId,
          unitId: d.unitId,
          invoiceNumber: `INV-${year}-${String(seq).padStart(5, '0')}`,
          amount: d.totalAmount,
          dueDate: d.paymentDate,
          status: 'paid',
          items: d.items,
        },
        select: { id: true },
      });
      const payment = await prisma.payment.create({
        data: {
          buildingId: building.id,
          tenantId: d.tenantId,
          unitId: d.unitId,
          invoiceId: invoice.id,
          amount: d.totalAmount,
          baseAmount: d.type === 'rent' ? d.baseAmount : undefined,
          vatAmount: d.type === 'rent' ? d.vatAmount : undefined,
          withholdingAmount:
            d.type === 'rent' ? d.withholdingAmount : undefined,
          type: d.type,
          status: 'completed',
          paymentDate: d.paymentDate,
        },
        select: { id: true },
      });
      if (d.periodIds.length > 0) {
        await prisma.paymentPeriod.updateMany({
          where: { id: { in: d.periodIds } },
          data: {
            status: 'paid',
            paidAt: d.paymentDate,
            paymentId: payment.id,
          },
        });
      }
    }
    paymentCount += drafts.length;

    // Tenant with room for a second car asks to register it
    const withSpareSpot = activeLeases.find((l) => l.slot === 1)!;
    await prisma.tenantParkingRequest.create({
      data: {
        buildingId: building.id,
        tenantId: withSpareSpot.tenantId,
        leaseId: withSpareSpot.leaseId,
        unitId: withSpareSpot.unitId,
        licensePlate: `3-AA-${++plateNo}`,
        status: 'pending',
      },
    });

    for (const m of MAINTENANCE) {
      const lease = activeLeases.find((l) => l.slot === m.slot)!;
      await prisma.maintenanceRequest.create({
        data: {
          buildingId: building.id,
          unitId: lease.unitId,
          tenantId: lease.tenantId,
          title: m.title,
          description: m.description,
          priority: m.priority,
          status: m.status,
          completedAt:
            m.status === 'completed' ? addDays(today, -2) : undefined,
        },
      });
    }

    await prisma.announcement.create({
      data: {
        buildingId: building.id,
        title: 'Scheduled water interruption',
        content: `Water supply at ${config.name} will be off this Saturday from 9:00 to 13:00 for tank cleaning. Please store water in advance.`,
        priority: 'important',
        publishedAt: addDays(today, -3),
        createdById: owner.id,
        createdByName: owner.name,
      },
    });
  }

  // One unpublished draft to show the draft state
  await prisma.announcement.create({
    data: {
      buildingId: buildings.get(firstBuildingKey)!.id,
      title: 'Parking lot repainting',
      content:
        'The parking lot will be repainted next month. Details to follow.',
      priority: 'normal',
      createdById: owners.get('o1')!.id,
      createdByName: owners.get('o1')!.name,
    },
  });

  console.log(`Tenants: ${tenantNo} — payments/receipts: ${paymentCount}`);
  console.log(
    '\n--- Demo seed complete (password for all: ' + DEMO_PASSWORD + ') ---',
  );
  console.log(
    'Owners:   owner1@test.com (Pro), owner2@test.com (Pro), owner3@test.com (Free trial)',
  );
  console.log('Managers: manager1@test.com … manager4@test.com');
  console.log(`Tenants:  tenant1@test.com … tenant${tenantNo}@test.com`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
