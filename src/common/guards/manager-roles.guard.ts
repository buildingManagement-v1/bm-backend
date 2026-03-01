import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { whereActive } from '../soft-delete/soft-delete.scope';
import { MANAGER_ROLES_KEY } from '../decorators/require-manager-roles.decorator';
import { ManagerRole } from 'generated/prisma/client';

interface RequestUser {
  id: string;
  email: string;
  role: string;
  type: string;
  buildings?: string[];
}

interface RequestWithUser extends Request {
  user: RequestUser;
  buildingId: string;
}

@Injectable()
export class ManagerRolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.get<ManagerRole[]>(
      MANAGER_ROLES_KEY,
      context.getHandler(),
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    const buildingId = request.buildingId;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (!buildingId) {
      throw new ForbiddenException('Building context not set');
    }

    // Building owners have all permissions
    if (user.role === 'owner' || user.type === 'app') {
      return true;
    }

    // For managers, check if they have the required role in this building
    if (user.role === 'manager') {
      const managerBuildingRole =
        await this.prisma.managerBuildingRole.findFirst({
          where: whereActive({ managerId: user.id, buildingId }),
          select: {
            roles: true,
          },
        });

      if (!managerBuildingRole) {
        throw new ForbiddenException('No access to this building');
      }

      const hasRequiredRole = requiredRoles.some((role) =>
        managerBuildingRole.roles.includes(role),
      );

      if (!hasRequiredRole) {
        throw new ForbiddenException(
          'Insufficient permissions for this operation',
        );
      }

      return true;
    }

    throw new ForbiddenException('Invalid user role');
  }
}
