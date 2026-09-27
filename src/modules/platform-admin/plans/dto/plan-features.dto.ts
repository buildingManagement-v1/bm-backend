import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class PlanFeaturesDto {
  @ApiProperty({ example: 5 })
  @IsInt()
  @Min(0)
  maxBuildings!: number;

  @ApiProperty({ example: 50, description: 'Active units per building' })
  @IsInt()
  @Min(0)
  maxUnits!: number;

  @ApiProperty({ example: 7 })
  @IsInt()
  @Min(0)
  maxManagers!: number;

  @ApiProperty({ example: [], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  premiumFeatures?: string[];
}
