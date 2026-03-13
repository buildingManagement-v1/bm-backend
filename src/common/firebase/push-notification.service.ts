import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { UserType } from 'generated/prisma/client';
import { DeviceTokenService } from '../device-token/device-token.service';

const FIREBASE_MODULE = 'firebase-admin';

interface MessagingLike {
  sendEachForMulticast(msg: {
    tokens: string[];
    notification?: { title: string; body: string };
    data?: Record<string, string>;
    android?: { priority: string };
    apns?: object;
  }): Promise<{
    responses: Array<{
      success: boolean;
      error?: { code?: string };
    }>;
  }>;
}

interface FirebaseAdminModule {
  apps: unknown[];
  initializeApp: (opts: { credential: unknown }) => void;
  credential: { cert: (c: object) => unknown };
  messaging: () => MessagingLike;
}

@Injectable()
export class PushNotificationService implements OnModuleInit {
  private messaging: MessagingLike | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly deviceTokenService: DeviceTokenService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      const path = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');
      const json = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
      if (!path && !json) return;

      const admin = (await import(
        /* webpackIgnore: true */ FIREBASE_MODULE
      )) as FirebaseAdminModule;
      if (admin.apps.length > 0) {
        this.messaging = admin.messaging();
        return;
      }

      let credential: object;
      if (json) {
        credential = JSON.parse(json) as object;
      } else if (path && fs.existsSync(path)) {
        credential = JSON.parse(fs.readFileSync(path, 'utf8')) as object;
      } else {
        return;
      }

      admin.initializeApp({
        credential: admin.credential.cert(credential),
      });
      this.messaging = admin.messaging();
    } catch {
      this.messaging = null;
    }
  }

  async sendToUser(
    userId: string,
    userType: UserType,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    if (userType === 'platform_admin') return;
    if (!this.messaging) return;

    const tokens = await this.deviceTokenService.getTokensByUser(
      userId,
      userType,
    );
    if (tokens.length === 0) return;

    const message = {
      tokens: tokens.map((t) => t.token),
      notification: { title, body },
      data: data ?? {},
      android: { priority: 'high' as const },
      apns: {
        payload: { aps: { sound: 'default', contentAvailable: true } },
        fcmOptions: {},
      },
    };

    const result = await this.messaging.sendEachForMulticast(message);

    for (let idx = 0; idx < result.responses.length; idx++) {
      const resp = result.responses[idx];
      const tokenObj = tokens[idx];
      if (!tokenObj || !resp) continue;
      const invalid =
        !resp.success &&
        (resp.error?.code === 'messaging/invalid-registration-token' ||
          resp.error?.code === 'messaging/registration-token-not-registered');
      if (invalid) {
        this.deviceTokenService.deleteByToken(tokenObj.token).catch(() => {});
      }
    }
  }
}
