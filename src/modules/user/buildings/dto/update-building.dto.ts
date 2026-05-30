import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEmail,
  IsObject,
  IsEnum,
  IsNumber,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { UserStatus } from 'generated/prisma/client';

export class UpdateBuildingDto {
  @ApiProperty({ example: 'Sunrise Apartments', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: '123 Main St', required: false })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({ example: 'New York', required: false })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiProperty({ example: 'USA', required: false })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiProperty({ example: 'contact@sunrise.com', required: false })
  @IsEmail()
  @IsOptional()
  contactEmail?: string;

  @ApiProperty({ example: '+1234567890', required: false })
  @IsString()
  @IsOptional()
  contactPhone?: string;

  @ApiProperty({ example: 'https://example.com/logo.png', required: false })
  @IsString()
  @IsOptional()
  logoUrl?: string;

  @ApiProperty({ example: { theme: 'dark' }, required: false })
  @IsObject()
  @IsOptional()
  settings?: Record<string, any>;

  @ApiProperty({
    enum: UserStatus,
    example: UserStatus.active,
    required: false,
  })
  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;

  @ApiProperty({
    example: 15,
    description: 'VAT rate percentage (0–100)',
    required: false,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  vatRate?: number;

  @ApiProperty({
    example: 3,
    description: 'Withholding tax rate percentage (0–100)',
    required: false,
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  withholdingRate?: number;

  @ApiProperty({
    example: 1,
    description: 'Default rent due day of month (1–30)',
    required: false,
  })
  @IsInt()
  @Min(1)
  @Max(30)
  @IsOptional()
  paymentCollectionDay?: number;

  @ApiProperty({
    example: 10,
    description: 'Total number of parking lots in the building',
    required: false,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  totalParkingLots?: number;
}
