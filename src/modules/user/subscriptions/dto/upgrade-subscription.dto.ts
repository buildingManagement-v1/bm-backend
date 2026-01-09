import { IsString, IsInt, Min } from 'class-validator';

export class UpgradeSubscriptionDto {
  @IsString()
  newPlanId: string;

  @IsInt()
  @Min(1)
  newBuildingCount: number;

  @IsInt()
  @Min(0)
  newManagerCount: number;
}
