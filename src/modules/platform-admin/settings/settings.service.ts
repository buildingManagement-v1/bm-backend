import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import { ActivityLogsService } from 'src/modules/user/activity-logs/activity-logs.service';

interface SettingDefinition {
  label: string;
  description: string;
  maxLength: number;
  /** Admin roles allowed to change it */
  editableBy: string[];
  defaultValue: () => string;
}

/** Every admin-editable setting. Unknown keys are rejected. */
export const SETTINGS: Record<string, SettingDefinition> = {
  'billing.paymentInstructions': {
    label: 'Plan payment instructions',
    description:
      'Shown to owners when they buy or renew a plan: the bank account(s) to transfer to and what to write as reference.',
    maxLength: 2000,
    editableBy: ['super_admin', 'billing_manager'],
    defaultValue: () =>
      process.env.BILLING_PAYMENT_INSTRUCTIONS ??
      'Transfer the amount to the Building Management bank account shared by our support team, then upload the bank receipt here.',
  },
  'support.email': {
    label: 'Support email',
    description: 'Where owners are told to write for help.',
    maxLength: 200,
    editableBy: ['super_admin', 'system_manager'],
    defaultValue: () => '',
  },
  'support.phone': {
    label: 'Support phone',
    description: 'Phone number shown to owners for help.',
    maxLength: 50,
    editableBy: ['super_admin', 'system_manager'],
    defaultValue: () => '',
  },
};

export type SettingKey = keyof typeof SETTINGS;

@Injectable()
export class SettingsService {
  constructor(
    private prisma: PrismaService,
    private activityLogsService: ActivityLogsService,
  ) {}

  async get(key: SettingKey): Promise<string> {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key },
    });
    return row?.value ?? SETTINGS[key].defaultValue();
  }

  /** Values owners may see (no internal settings). */
  async publicValues() {
    const [paymentInstructions, supportEmail, supportPhone] = await Promise.all(
      [
        this.get('billing.paymentInstructions'),
        this.get('support.email'),
        this.get('support.phone'),
      ],
    );
    return { paymentInstructions, supportEmail, supportPhone };
  }

  async list(adminRoles: string[]) {
    const rows = await this.prisma.platformSetting.findMany();
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return Object.entries(SETTINGS).map(([key, def]) => ({
      key,
      label: def.label,
      description: def.description,
      maxLength: def.maxLength,
      value: byKey.get(key)?.value ?? def.defaultValue(),
      isDefault: !byKey.has(key),
      canEdit: def.editableBy.some((r) => adminRoles.includes(r)),
      updatedAt: byKey.get(key)?.updatedAt ?? null,
    }));
  }

  async update(
    values: Record<string, string>,
    admin: { id: string; name: string; roles: string[] },
  ) {
    const entries = Object.entries(values);
    if (entries.length === 0) {
      throw new BadRequestException('Nothing to update');
    }
    for (const [key, value] of entries) {
      const def = SETTINGS[key];
      if (!def) throw new BadRequestException(`Unknown setting: ${key}`);
      if (!def.editableBy.some((r) => admin.roles.includes(r))) {
        throw new ForbiddenException(`You can't change "${def.label}"`);
      }
      if (typeof value !== 'string' || value.length > def.maxLength) {
        throw new BadRequestException(
          `${def.label} must be text of at most ${def.maxLength} characters`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of entries) {
        await tx.platformSetting.upsert({
          where: { key },
          create: { key, value: value.trim(), updatedById: admin.id },
          update: { value: value.trim(), updatedById: admin.id },
        });
      }
    });
    await this.activityLogsService.createPlatformLog({
      action: 'update',
      entityType: 'platform_setting',
      entityId: entries.map(([k]) => k).join(','),
      adminId: admin.id,
      adminName: admin.name,
      details: { keys: entries.map(([k]) => k) } as Prisma.InputJsonValue,
    });
    return this.list(admin.roles);
  }
}
