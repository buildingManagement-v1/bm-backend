import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, Min } from 'class-validator';

export class UpgradeSubscriptionDto {
  @ApiProperty({ example: 'plan_456' })
  @IsString()
  newPlanId: string;

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(1)
  newBuildingCount: number;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(0)
  newManagerCount: number;
}
