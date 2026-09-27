import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

/** Claim that marks a JWT as a refresh token. Access tokens never carry it. */
export const REFRESH_TOKEN_USE = 'refresh';

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: string;
  type: string;
  [claim: string]: unknown;
}

export type RefreshTokenPayload<T extends AuthTokenPayload> = T & {
  tokenUse: typeof REFRESH_TOKEN_USE;
  iat: number;
};

export function signAccessToken(
  jwt: JwtService,
  payload: AuthTokenPayload,
): string {
  return jwt.sign(payload, { expiresIn: '15m' });
}

export function signAuthTokens(
  jwt: JwtService,
  payload: AuthTokenPayload,
  refreshExpiresIn: '24h' | '7d' | '30d',
): { accessToken: string; refreshToken: string } {
  return {
    accessToken: signAccessToken(jwt, payload),
    refreshToken: jwt.sign(
      { ...payload, tokenUse: REFRESH_TOKEN_USE },
      { expiresIn: refreshExpiresIn },
    ),
  };
}

/**
 * Verifies a refresh token and returns its payload. Rejects access tokens
 * presented as refresh tokens.
 */
export function verifyRefreshToken<T extends AuthTokenPayload>(
  jwt: JwtService,
  token: string,
): RefreshTokenPayload<T> {
  let payload: RefreshTokenPayload<T>;
  try {
    payload = jwt.verify<RefreshTokenPayload<T>>(token);
  } catch {
    throw new UnauthorizedException('Invalid or expired refresh token');
  }
  if (payload.tokenUse !== REFRESH_TOKEN_USE) {
    throw new UnauthorizedException('Invalid or expired refresh token');
  }
  return payload;
}

/**
 * True when the token was issued before the account's last password change,
 * i.e. the session should have been revoked by that change.
 */
export function issuedBeforePasswordChange(
  iat: number,
  passwordChangedAt: Date | null | undefined,
): boolean {
  if (!passwordChangedAt) return false;
  return iat < Math.floor(passwordChangedAt.getTime() / 1000);
}
