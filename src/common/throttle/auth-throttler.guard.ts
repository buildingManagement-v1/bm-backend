import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limits by client IP plus the account being targeted, so repeated
 * guesses against one account are blocked without locking out other users
 * who share an IP (e.g. behind the same proxy).
 */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const { body, ip } = req as { body?: { email?: unknown }; ip?: string };
    const email =
      typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    return Promise.resolve(`${ip ?? 'unknown'}|${email}`);
  }
}
