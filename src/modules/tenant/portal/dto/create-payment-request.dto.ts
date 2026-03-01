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

export class CreatePaymentRequestDto {
  @ApiProperty()
  @IsUUID()
  unitId: string;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  amount: number;

  @ApiProperty({ enum: PaymentType })
  @IsEnum(PaymentType as object)
  type: (typeof PaymentType)[keyof typeof PaymentType];

  @ApiProperty({ example: '2025-01-01' })
  @IsDateString()
  paymentDate: string;

  @ApiProperty({ example: ['2025-01', '2025-02'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  monthsCovered?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
