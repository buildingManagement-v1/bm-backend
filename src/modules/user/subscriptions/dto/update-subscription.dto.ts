import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

/** Cancel an active subscription, or reactivate a cancelled one still in its cycle. */
export class UpdateSubscriptionDto {
  @ApiProperty({ enum: ['active', 'cancelled'] })
  @IsIn(['active', 'cancelled'])
  status: 'active' | 'cancelled';
}
