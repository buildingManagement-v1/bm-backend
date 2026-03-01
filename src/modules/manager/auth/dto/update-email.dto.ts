import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty } from 'class-validator';

export class UpdateEmailDto {
  @ApiProperty({ example: 'newemail@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
