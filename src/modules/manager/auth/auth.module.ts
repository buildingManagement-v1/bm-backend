import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { DeviceTokenModule } from '../../../common/device-token/device-token.module';
import { ManagerDeviceTokenController } from './device-token.controller';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
    DeviceTokenModule,
  ],
  controllers: [AuthController, ManagerDeviceTokenController],
  providers: [AuthService],
})
export class AuthModule {}
