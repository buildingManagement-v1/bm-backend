import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsDateString,
  IsNumber,
  IsArray,
} from 'class-validator';
import { PaymentType } from 'generated/prisma/enums';

export class CreatePaymentDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174004' })
  @IsUUID()
  tenantId: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174005' })
  @IsUUID()
  unitId: string;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  amount: number;

  @ApiProperty({ enum: PaymentType, example: PaymentType['rent'] })
  @IsEnum(PaymentType as object)
  type: PaymentType;

  @ApiProperty({ example: '2025-01-01T00:00:00Z' })
  @IsDateString()
  paymentDate: string;

  @ApiProperty({ example: ['2025-01', '2025-02'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  monthsCovered?: string[]; // Format: ["2025-01", "2025-02"]

  @ApiProperty({ example: 'January rent payment', required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
