import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsNumber,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UnitType, UnitStatus } from 'generated/prisma/client';

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
  @IsNotEmpty()
  @Type(() => Number)
  rentPrice: number;

  @ApiProperty({
    enum: UnitStatus,
    example: UnitStatus.occupied,
    required: false,
  })
  @IsOptional()
  @IsEnum(UnitStatus)
  status?: UnitStatus;
}
