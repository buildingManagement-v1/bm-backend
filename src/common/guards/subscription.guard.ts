import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface RequestWithUser {
  method: string;
  user: { id: string; role: string; type: string };
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Enforces the owning account's subscription on property-management routes.
 * Managers are billed through the owner that employs them. Without an active
 * subscription the account is read-only: data stays viewable, writes are
 * blocked until a plan is (re)activated.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user || !user.id) {
      throw new ForbiddenException('User not authenticated');
    }

    if (user.type !== 'app') {
      throw new ForbiddenException('This endpoint is not available to you');
    }

    let ownerId = user.id;
    if (user.role === 'manager') {
      const manager = await this.prisma.manager.findFirst({
        where: { id: user.id, deletedAt: null },
        select: { userId: true },
      });
      if (!manager) {
        throw new ForbiddenException('Manager account not found');
      }
      ownerId = manager.userId;
    }

    const subscription = await this.prisma.subscription.findFirst({
      where: { userId: ownerId, status: 'active' },
      orderBy: { billingCycleEnd: 'desc' },
    });

    const now = new Date();
    if (subscription && subscription.billingCycleEnd < now) {
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'expired' },
      });
    }

    const isActive = !!subscription && subscription.billingCycleEnd >= now;
    if (isActive || READ_METHODS.has(request.method.toUpperCase())) {
      return true;
    }

    throw new ForbiddenException(
      user.role === 'manager'
        ? "The building owner's subscription is not active. Changes are disabled until it is renewed."
        : 'Your subscription is not active. Your account is read-only until a plan is activated.',
    );
  }
}
