import { ApiProperty } from '@nestjs/swagger';
import {
  IsUUID,
  IsDateString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsInt,
  IsObject,
  IsPositive,
  Min,
  Max,
} from 'class-validator';

export class CreateLeaseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  tenantId!: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174001' })
  @IsUUID()
  unitId!: string;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({
    example: '2026-12-31',
    description: 'Must be after startDate',
  })
  @IsDateString()
  endDate!: string;

  @ApiProperty({ example: 15000, description: 'Monthly rent before tax' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  rentAmount!: number;

  @ApiProperty({ example: 30000, required: false })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  securityDeposit?: number;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  carsAllowed?: number;

  @ApiProperty({
    example: true,
    description: "Collect rent on the building's default payment day",
  })
  @IsBoolean()
  useDefaultPaymentDay!: boolean;

  @ApiProperty({
    example: 5,
    required: false,
    description: 'Required when useDefaultPaymentDay is false',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  paymentCollectionDay?: number;

  @ApiProperty({ example: false })
  @IsBoolean()
  applyWithholding!: boolean;

  @ApiProperty({ required: false, description: 'Free-form lease terms' })
  @IsOptional()
  @IsObject()
  terms?: Record<string, unknown>;
}
