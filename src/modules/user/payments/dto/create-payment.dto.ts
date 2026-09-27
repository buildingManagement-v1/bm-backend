import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUUID,
  IsEnum,
  IsDateString,
  IsNumber,
  IsArray,
  ArrayMaxSize,
  IsPositive,
  Matches,
} from 'class-validator';
import { PaymentType } from 'generated/prisma/enums';

export class CreatePaymentDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174004' })
  @IsUUID()
  tenantId!: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174005' })
  @IsUUID()
  unitId!: string;

  @ApiProperty({ example: 1000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @ApiProperty({ enum: PaymentType, example: PaymentType['rent'] })
  @IsEnum(PaymentType as object)
  type!: PaymentType;

  @ApiProperty({ example: '2025-01-01T00:00:00Z' })
  @IsDateString()
  paymentDate!: string;

  @ApiProperty({ example: ['2025-01', '2025-02'], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(36)
  @Matches(/^\d{4}-\d{2}(-\d{2})?$/, {
    each: true,
    message: 'monthsCovered must contain period keys like 2026-01-01',
  })
  monthsCovered?: string[]; // period keys (periodStart dates), e.g. ["2026-01-01"]

  @ApiProperty({ example: 'January rent payment', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
