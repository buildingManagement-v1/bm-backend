import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  MinLength,
} from 'class-validator';

export class TenantLoginDto {
  @ApiProperty({ example: 'tenant@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Password123' })
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({
    required: false,
    description:
      'When true, refresh token lasts 30 days; when false, 24 hours (session)',
  })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;

  @ApiProperty({
    required: false,
    description:
      'Building to sign in to, when the email is a tenant in more than one building',
  })
  @IsOptional()
  @IsUUID()
  buildingId?: string;
}
