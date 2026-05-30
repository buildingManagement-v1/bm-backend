import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsObject,
  IsNumber,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class CreateBuildingDto {
  @ApiProperty({ example: 'Sunrise Apartments' })
  @IsString()
  @IsNotEmpty()
  name!: string;

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

  @ApiProperty({ example: '+1234567890' })
  @IsString()
  @IsNotEmpty()
  contactPhone!: string;

  @ApiProperty({ example: 'https://example.com/logo.png', required: false })
  @IsString()
  @IsOptional()
  logoUrl?: string;

  @ApiProperty({ example: { theme: 'dark' }, required: false })
  @IsObject()
  @IsOptional()
  settings?: Record<string, any>;

  @ApiProperty({
    example: 15,
    description: 'VAT rate percentage (0–100)',
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  vatRate!: number;

  @ApiProperty({
    example: 3,
    description: 'Withholding tax rate percentage (0–100)',
  })
  @IsNumber()
  @Min(0)
  @Max(100)
  withholdingRate!: number;

  @ApiProperty({
    example: 1,
    description: 'Default rent due day of month (1–30)',
  })
  @IsInt()
  @Min(1)
  @Max(30)
  paymentCollectionDay!: number;

  @ApiProperty({
    example: 10,
    description: 'Total number of parking lots in the building',
  })
  @IsInt()
  @Min(0)
  totalParkingLots!: number;
}
