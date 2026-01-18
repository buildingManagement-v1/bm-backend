import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsObject,
  IsEnum,
  IsOptional,
  Min,
} from 'class-validator';
import { PlanStatus } from 'generated/prisma/client';

export class UpdatePlanDto {
  @ApiProperty({ example: 'Gold Plan', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 499.99, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiProperty({
    example: {
      maxBuildings: 5,
      maxUnits: 50,
      maxManagers: 7,
      premiumFeatures: [],
    },
    required: false,
  })
  @IsObject()
  @IsOptional()
  features?: Record<string, any>;

  @ApiProperty({ enum: PlanStatus, required: false })
  @IsEnum(PlanStatus)
  @IsOptional()
  status?: PlanStatus;

  @ApiProperty({
    enum: ['public', 'custom'],
    example: 'public',
    required: false,
  })
  @IsEnum(['public', 'custom'])
  @IsOptional()
  type?: 'public' | 'custom';
}
