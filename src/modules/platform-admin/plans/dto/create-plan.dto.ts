import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsEnum,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PlanFeaturesDto } from './plan-features.dto';

export class CreatePlanDto {
  @ApiProperty({
    example: 'Pro Plan',
    description: 'Name of the subscription plan',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @ApiProperty({
    example: 499.99,
    description: 'Yearly price of the plan (ETB)',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiProperty({ type: PlanFeaturesDto, description: 'Plan limits' })
  @ValidateNested()
  @Type(() => PlanFeaturesDto)
  features: PlanFeaturesDto;

  @ApiProperty({
    enum: ['public', 'custom'],
    example: 'public',
    description:
      'public plans are listed to owners; custom plans are only assigned by an admin',
  })
  @IsEnum(['public', 'custom'])
  type: 'public' | 'custom';
}
