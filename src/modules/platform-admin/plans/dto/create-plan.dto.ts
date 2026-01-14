import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsNumber, IsObject, Min } from 'class-validator';

export class CreatePlanDto {
  @ApiProperty({ example: 'Gold Plan' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(0)
  buildingPrice: number;

  @ApiProperty({ example: 50 })
  @IsNumber()
  @Min(0)
  managerPrice: number;

  @ApiProperty({ example: { feature1: true, feature2: 'limited' } })
  @IsObject()
  features: Record<string, any>;
}
