import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class TerminateLeaseDto {
  @ApiProperty({
    required: false,
    example: '2026-09-27',
    description:
      'Last day of the tenancy (defaults to today, cannot be in the future). ' +
      'Unpaid rent after it is removed and the cycle containing it is prorated.',
  })
  @IsOptional()
  @IsDateString()
  effectiveDate?: string;

  @ApiProperty({ required: false, example: 'Tenant moved out early' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
