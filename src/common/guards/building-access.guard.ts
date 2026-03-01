import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { whereActive } from '../soft-delete/soft-delete.scope';

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
export class BuildingAccessGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    const buildingId = request.buildingId;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (!buildingId) {
      throw new ForbiddenException('Building context not set');
    }

    // If user is building owner
    if (user.role !== 'manager') {
      const building = await this.prisma.building.findFirst({
        where: whereActive({ id: buildingId }),
        select: { userId: true },
      });

      if (!building) {
        throw new ForbiddenException('Building not found');
      }

      if (building.userId !== user.id) {
        throw new ForbiddenException('You do not have access to this building');
      }

      return true;
    }

    // If user is manager
    if (user.role === 'manager') {
      if (!user.buildings || !user.buildings.includes(buildingId)) {
        throw new ForbiddenException('You do not have access to this building');
      }

      return true;
    }

    throw new ForbiddenException('Invalid user role');
  }
}
