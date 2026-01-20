import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsOptional,
  IsDateString,
  IsNumber,
  IsUUID,
  MinLength,
} from 'class-validator';

export class OnboardTenantDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'john@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+1234567890', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'password123', required: false })
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @ApiProperty({ example: 'uuid' })
  @IsUUID()
  unitId: string;

  @ApiProperty({ example: '2024-01-01' })
  @IsDateString()
  leaseStartDate: string;

  @ApiProperty({ example: '2025-01-01' })
  @IsDateString()
  leaseEndDate: string;

  @ApiProperty({ example: 1500 })
  @IsNumber()
  rentAmount: number;

  @ApiProperty({ example: 3000, required: false })
  @IsOptional()
  @IsNumber()
  securityDeposit?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
