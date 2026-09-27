import { Throttle } from '@nestjs/throttler';

/** Login / OTP / password-reset endpoints: 10 attempts per minute. */
export const AuthRateLimit = () =>
  Throttle({ default: { limit: 10, ttl: 60_000 } });
