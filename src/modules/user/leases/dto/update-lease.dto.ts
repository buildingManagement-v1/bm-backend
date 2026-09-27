import { ApiProperty } from '@nestjs/swagger';
import {
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

/**
 * Edits an active lease. Rent, dates and payment-day changes re-price only the
 * cycles that haven't started and aren't paid; to end a lease early use the
 * terminate endpoint.
 */
export class UpdateLeaseDto {
  @ApiProperty({
    required: false,
    description: 'Only while no cycle has started or been paid',
  })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiProperty({ required: false })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @IsOptional()
  rentAmount?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  securityDeposit?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  carsAllowed?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  useDefaultPaymentDay?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  paymentCollectionDay?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  applyWithholding?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  terms?: Record<string, unknown>;
}
