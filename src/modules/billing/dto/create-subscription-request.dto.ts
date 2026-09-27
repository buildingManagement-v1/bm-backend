import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Multipart form body; the bank-transfer receipt is the `receipt` file. */
export class CreateSubscriptionRequestDto {
  @ApiProperty({ description: 'Plan to buy, renew or switch to' })
  @IsUUID()
  planId!: string;

  @ApiProperty({
    required: false,
    example: 'FT26270ABC123',
    description: 'Bank transaction reference',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  paymentReference?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
