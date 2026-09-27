import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

interface RequestUser {
  id: string;
  role: string;
  type: string;
}

type UserKind = 'owner' | 'manager' | 'tenant' | 'platform';

function kindOf(user: RequestUser): UserKind | null {
  if (user.type === 'platform') return 'platform';
  if (user.type === 'tenant') return 'tenant';
  if (user.type === 'app' && user.role === 'owner') return 'owner';
  if (user.type === 'app' && user.role === 'manager') return 'manager';
  return null;
}

function assertKind(context: ExecutionContext, allowed: UserKind[]): boolean {
  const user = context.switchToHttp().getRequest<{ user?: RequestUser }>().user;
  if (!user) {
    throw new ForbiddenException('User not authenticated');
  }
  const kind = kindOf(user);
  if (!kind || !allowed.includes(kind)) {
    throw new ForbiddenException('This endpoint is not available to you');
  }
  return true;
}

/** Building owners only. */
@Injectable()
export class OwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return assertKind(context, ['owner']);
  }
}

/** Managers only. */
@Injectable()
export class ManagerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return assertKind(context, ['manager']);
  }
}

/** Owners and managers (the property-management app). */
@Injectable()
export class AppUserGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return assertKind(context, ['owner', 'manager']);
  }
}

/** Tenant portal users only. */
@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return assertKind(context, ['tenant']);
  }
}

/** Platform admins only (role checks are done by RolesGuard). */
@Injectable()
export class PlatformGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    return assertKind(context, ['platform']);
  }
}
