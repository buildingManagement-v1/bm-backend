import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, Min, IsDateString } from 'class-validator';

export class CreateSubscriptionDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174005' })
  @IsString()
  userId: string;

  @ApiProperty({ example: 'plan_123' })
  @IsString()
  planId: string;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(1)
  buildingCount: number;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(0)
  managerCount: number;

  @ApiProperty({ example: '2025-01-01T00:00:00Z' })
  @IsDateString()
  billingCycleStart: string;
}
