import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PlanStatus } from 'generated/prisma/enums';
import { PlanFeaturesDto } from './plan-features.dto';

export class UpdatePlanDto {
  @ApiProperty({ required: false })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false, description: 'Yearly price (ETB)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiProperty({ type: PlanFeaturesDto, required: false })
  @ValidateNested()
  @Type(() => PlanFeaturesDto)
  @IsOptional()
  features?: PlanFeaturesDto;

  @ApiProperty({ enum: PlanStatus, required: false })
  @IsEnum(PlanStatus)
  @IsOptional()
  status?: PlanStatus;

  @ApiProperty({ enum: ['public', 'custom'], required: false })
  @IsEnum(['public', 'custom'])
  @IsOptional()
  type?: 'public' | 'custom';
}
