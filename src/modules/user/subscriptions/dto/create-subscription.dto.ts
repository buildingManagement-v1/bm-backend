import { IsString, IsInt, Min, IsDateString } from 'class-validator';

export class CreateSubscriptionDto {
  @IsString()
  userId: string;

  @IsString()
  planId: string;

  @IsInt()
  @Min(1)
  buildingCount: number;

  @IsInt()
  @Min(0)
  managerCount: number;

  @IsDateString()
  billingCycleStart: string;
}
