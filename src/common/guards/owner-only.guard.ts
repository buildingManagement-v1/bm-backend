import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

interface RequestUser {
  id: string;
  email: string;
  role: string;
  type: string;
}

interface RequestWithUser extends Request {
  user: RequestUser;
}

@Injectable()
export class OwnerOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Only building owners (not managers, tenants or platform admins)
    if (user.type !== 'app' || user.role !== 'owner') {
      throw new ForbiddenException(
        'This operation is restricted to building owners only',
      );
    }

    return true;
  }
}
