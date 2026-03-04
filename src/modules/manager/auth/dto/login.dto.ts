import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginManagerDto {
  @ApiProperty({ example: 'manager@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ required: false, description: 'When true, refresh token lasts 30 days; when false, 24 hours (session)' })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
