import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface RequestWithUser {
  user: { id: string; role: string };
}

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user || !user.id) {
      throw new ForbiddenException('User not authenticated');
    }

    // Only check for owners, not managers
    if (user.role === 'manager') {
      return true;
    }

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: 'active',
      },
    });

    if (!subscription) {
      throw new ForbiddenException(
        'No active subscription found. Please subscribe to continue.',
      );
    }

    // Check if subscription is expired
    const now = new Date();
    if (subscription.billingCycleEnd < now) {
      // Update status to expired
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'expired' },
      });

      throw new ForbiddenException(
        'Your subscription has expired. Please renew to continue.',
      );
    }

    return true;
  }
}
