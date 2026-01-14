import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class TenantLoginDto {
  @ApiProperty({ example: 'tenant@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Password123' })
  @IsNotEmpty()
  @MinLength(6)
  password: string;
}
