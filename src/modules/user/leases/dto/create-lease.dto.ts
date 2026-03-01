import { ApiProperty } from '@nestjs/swagger';
import {
  IsUUID,
  IsDateString,
  IsNumber,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { LeaseStatus } from 'generated/prisma/enums';

export class CreateLeaseDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  tenantId: string;

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174001' })
  @IsUUID()
  unitId: string;

  @ApiProperty({ example: '2023-01-01T00:00:00Z' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ example: '2024-01-01T00:00:00Z' })
  @IsDateString()
  endDate: string;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  rentAmount: number;

  @ApiProperty({ example: 1000, required: false })
  @IsOptional()
  @IsNumber()
  securityDeposit?: number;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsNumber()
  carsAllowed?: number;

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
