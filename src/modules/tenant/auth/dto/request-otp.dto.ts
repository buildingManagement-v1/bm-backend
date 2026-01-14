import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class RequestOtpDto {
  @ApiProperty({ example: 'tenant@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
