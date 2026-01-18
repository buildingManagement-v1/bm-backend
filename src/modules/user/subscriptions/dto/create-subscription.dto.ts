import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsDateString } from 'class-validator';

export class CreateSubscriptionDto {
  @ApiProperty({
    example: 'user-uuid-here',
    description: 'User ID to assign subscription to',
  })
  @IsString()
  userId: string;

  @ApiProperty({
    example: 'plan-uuid-here',
    description: 'Plan ID to subscribe to',
  })
  @IsString()
  planId: string;

  @ApiProperty({
    example: '2026-01-18',
    description: 'Billing cycle start date (YYYY-MM-DD)',
  })
  @IsDateString()
  billingCycleStart: string;
}
