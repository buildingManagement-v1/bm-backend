import { Module } from '@nestjs/common';
import { ActivityLogsModule } from 'src/modules/user/activity-logs/activity-logs.module';
import { LoginAdvertsController } from './login-adverts.controller';
import { LoginAdvertsService } from './login-adverts.service';

@Module({
  imports: [ActivityLogsModule],
  providers: [LoginAdvertsService],
  controllers: [LoginAdvertsController],
})
export class LoginAdvertsModule {}
