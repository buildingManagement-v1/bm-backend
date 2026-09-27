import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsDateString,
  IsNumber,
  IsArray,
  IsPositive,
  ArrayMaxSize,
  Matches,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PaymentType } from 'generated/prisma/enums';

/** Multipart form body: monthsCovered arrives as a JSON-encoded string. */
export class CreatePaymentRequestDto {
  @ApiProperty()
  @IsUUID()
  unitId: string;

  @ApiProperty({ example: 11270, description: 'Total paid, including tax' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount: number;

  @ApiProperty({ enum: PaymentType })
  @IsEnum(PaymentType as object)
  type: (typeof PaymentType)[keyof typeof PaymentType];

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  paymentDate: string;

  @ApiProperty({
    example: '["2026-01-01","2026-02-01"]',
    required: false,
    description: 'JSON array of period keys (required for rent)',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    if (value === '') return undefined;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  })
  @IsArray()
  @ArrayMaxSize(36)
  @Matches(/^\d{4}-\d{2}(-\d{2})?$/, {
    each: true,
    message: 'monthsCovered must contain period keys like 2026-01-01',
  })
  monthsCovered?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
