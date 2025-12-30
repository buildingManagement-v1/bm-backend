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
  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  buildingPrice?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  managerPrice?: number;

  @IsObject()
  @IsOptional()
  features?: Record<string, any>;

  @IsEnum(PlanStatus)
  @IsOptional()
  status?: PlanStatus;
}
