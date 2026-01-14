import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'tenant@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: '123456' })
  @IsNotEmpty()
  otp: string;

  @ApiProperty({ example: 'NewPassword123', minLength: 6 })
  @IsNotEmpty()
  @MinLength(6)
  newPassword: string;
}
