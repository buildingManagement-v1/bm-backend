import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Admin assigns a plan directly (offline/negotiated payment, custom plans).
 * An active free trial is replaced; an active paid plan must be changed via
 * the upgrade endpoint instead.
 */
export class CreateSubscriptionDto {
  @ApiProperty({ description: 'Owner (user) id' })
  @IsUUID()
  userId: string;

  @ApiProperty({ description: 'Plan to assign (public or custom)' })
  @IsUUID()
  planId: string;

  @ApiProperty({
    example: '2026-01-18',
    description: 'Cycle start (YYYY-MM-DD)',
  })
  @IsDateString()
  billingCycleStart: string;

  @ApiProperty({
    required: false,
    default: 12,
    description: 'Cycle length in months',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(36)
  durationMonths?: number;

  @ApiProperty({
    required: false,
    example: 'Paid in cash at office, receipt #123',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
