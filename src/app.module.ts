import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/platform-admin/auth/auth.module';
import { TokenModule } from './common/token/token.module';
import { EmailModule } from './common/email/email.module';
import { AuthModule as UserAuthModule } from './modules/user/auth/auth.module';
import { AuthModule as ManagerAuthModule } from './modules/manager/auth/auth.module';
import { PlansModule } from './modules/platform-admin/plans/plans.module';
import { ManagersModule } from './modules/user/managers/managers.module';

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
  ],
})
export class AppModule {}
