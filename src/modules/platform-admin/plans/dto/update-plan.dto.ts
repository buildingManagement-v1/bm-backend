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

  @ApiProperty({ example: 100, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  buildingPrice?: number;

  @ApiProperty({ example: 50, required: false })
  @IsNumber()
  @Min(0)
  @IsOptional()
  managerPrice?: number;

  @ApiProperty({
    example: { feature1: true, feature2: 'limited' },
    required: false,
  })
  @IsObject()
  @IsOptional()
  features?: Record<string, any>;

  @ApiProperty({ enum: PlanStatus, required: false })
  @IsEnum(PlanStatus)
  @IsOptional()
  status?: PlanStatus;
}
