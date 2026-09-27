import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { REFRESH_TOKEN_USE } from '../token/auth-tokens';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  roles: string[];
  type: string;
  buildings?: string[];
  tokenUse?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_SECRET')!,
    });
  }

  validate(payload: JwtPayload) {
    // Refresh tokens are only accepted by the /refresh endpoints
    if (payload.tokenUse === REFRESH_TOKEN_USE) {
      throw new UnauthorizedException('Refresh tokens cannot be used here');
    }
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      roles: payload.roles,
      type: payload.type,
      buildings: payload.buildings,
    };
  }
}
