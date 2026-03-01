import { Module } from '@nestjs/common';
import { TenantAuthController } from './auth.controller';
import { TenantAuthService } from './auth.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { TokenModule } from '../../../common/token/token.module';
import { EmailModule } from '../../../common/email/email.module';
import { ActivityLogsModule } from '../../user/activity-logs/activity-logs.module';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    PrismaModule,
    TokenModule,
    EmailModule,
    ActivityLogsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET')!,
        signOptions: { expiresIn: '15m' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [TenantAuthController],
  providers: [TenantAuthService],
})
export class TenantAuthModule {}
