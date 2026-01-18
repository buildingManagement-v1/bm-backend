import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsEnum,
  Min,
} from 'class-validator';

export class CreatePlanDto {
  @ApiProperty({
    example: 'Pro Plan',
    description: 'Name of the subscription plan',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 499.99, description: 'Yearly price of the plan' })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiProperty({
    example: {
      maxBuildings: 5,
      maxUnits: 50,
      maxManagers: 7,
      premiumFeatures: ['hr_module', 'advanced_reports'],
    },
    description: 'Plan features and limits',
  })
  @IsObject()
  features: Record<string, any>;

  @ApiProperty({
    enum: ['public', 'custom'],
    example: 'public',
    description: 'Plan visibility type',
  })
  @IsEnum(['public', 'custom'])
  type: 'public' | 'custom';
}
