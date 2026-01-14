import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, Min } from 'class-validator';

export class ChangePlanDto {
  @ApiProperty({ example: 'plan_789' })
  @IsString()
  newPlanId: string;

  @ApiProperty({ example: 15 })
  @IsInt()
  @Min(1)
  newBuildingCount: number;

  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(0)
  newManagerCount: number;
}
