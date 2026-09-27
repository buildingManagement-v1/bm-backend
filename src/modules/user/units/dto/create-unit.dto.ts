import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsNumber,
  IsEnum,
  IsIn,
  IsPositive,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UnitType } from 'generated/prisma/client';

export class CreateUnitDto {
  @ApiProperty({ example: 'NB-101' })
  @IsString()
  @IsNotEmpty()
  unitNumber: string;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  floor?: number;

  @ApiProperty({ example: 850.5, required: false })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  size?: number;

  @ApiProperty({
    enum: UnitType,
    example: UnitType.office,
    required: false,
  })
  @IsOptional()
  @IsEnum(UnitType)
  type?: UnitType;

  @ApiProperty({ example: 1200.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Type(() => Number)
  rentPrice: number;

  @ApiProperty({
    enum: ['vacant', 'inactive'],
    example: 'vacant',
    required: false,
    description:
      'Occupied is set automatically by leases; inactive takes the unit off the market',
  })
  @IsOptional()
  @IsIn(['vacant', 'inactive'])
  status?: 'vacant' | 'inactive';
}
