import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/platform-admin/auth/auth.module';
import { TokenModule } from './common/token/token.module';
import { EmailModule } from './common/email/email.module';
import { AuthModule as UserAuthModule } from './modules/user/auth/auth.module';
import { AuthModule as ManagerAuthModule } from './modules/manager/auth/auth.module';
import { PlansModule } from './modules/platform-admin/plans/plans.module';
import { ManagersModule } from './modules/user/managers/managers.module';
import { BuildingsModule } from './modules/user/buildings/buildings.module';
import { UnitsModule } from './modules/user/units/units.module';
import { BuildingContextMiddleware } from './common/middleware/building-context.middleware';
import { TenantsModule } from './modules/user/tenants/tenants.module';
import { MaintenanceRequestsModule } from './modules/user/maintenance-requests/maintenance-requests.module';
import { PaymentsModule } from './modules/user/payments/payments.module';
import { LeasesModule } from './modules/user/leases/leases.module';
import { InvoicesModule } from './modules/user/invoices/invoices.module';
import { ReportsModule } from './modules/user/reports/reports.module';
import { DashboardModule } from './modules/user/dashboard/dashboard.module';
import { ActivityLogsModule } from './modules/user/activity-logs/activity-logs.module';
import { UsersModule } from './modules/platform-admin/users/users.module';
import { SubscriptionsModule } from './modules/user/subscriptions/subscriptions.module';
import { UserSubscriptionsModule } from './modules/user/user-subscriptions/user-subscriptions.module';

@Module({
  imports: [
    TokenModule,
    EmailModule,
    ConfigModule,
    PrismaModule,
    AuthModule,
    UserAuthModule,
    ManagerAuthModule,
    PlansModule,
    ManagersModule,
    BuildingsModule,
    UnitsModule,
    TenantsModule,
    MaintenanceRequestsModule,
    PaymentsModule,
    LeasesModule,
    InvoicesModule,
    ReportsModule,
    DashboardModule,
    ActivityLogsModule,
    UsersModule,
    SubscriptionsModule,
    UserSubscriptionsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(BuildingContextMiddleware)
      .forRoutes(
        'v1/app/units',
        'v1/app/tenants',
        'v1/app/maintenance-requests',
        'v1/app/payments',
        'v1/app/invoices',
        'v1/app/leases',
        'v1/app/reports',
        'v1/app/dashboard',
        'v1/app/activity-logs',
      );
  }
}
