import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateTenantProfileDto {
  @ApiProperty({ required: false, example: 'tenant@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false, example: '+251911000000' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiProperty({
    required: false,
    description: 'Current password, required when changing email',
  })
  @ValidateIf((o: UpdateTenantProfileDto) => o.email !== undefined)
  @IsString()
  @IsNotEmpty()
  currentPassword?: string;
}
