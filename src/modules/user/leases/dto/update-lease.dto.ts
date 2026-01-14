import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsEnum } from 'class-validator';
import { LeaseStatus } from 'generated/prisma/enums';

export class UpdateLeaseDto {
  @ApiProperty({ example: '2023-01-01T00:00:00Z', required: false })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({ example: '2024-01-01T00:00:00Z', required: false })
  @IsDateString()
  @IsOptional()
  endDate?: string;

  @ApiProperty({ example: 1000, required: false })
  @IsNumber()
  @IsOptional()
  rentAmount?: number;

  @ApiProperty({ example: 1000, required: false })
  @IsOptional()
  @IsNumber()
  securityDeposit?: number;

  @ApiProperty({
    enum: LeaseStatus,
    example: LeaseStatus['active'],
    required: false,
  })
  @IsEnum(LeaseStatus as object)
  @IsOptional()
  status?: LeaseStatus;

  @ApiProperty({ example: { petPolicy: 'allowed' }, required: false })
  @IsOptional()
  terms?: any;
}
