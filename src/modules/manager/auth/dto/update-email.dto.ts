import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { NormalizeEmail } from '../../../../common/decorators/normalize-email.decorator';

export class UpdateEmailDto {
  @ApiProperty({ example: 'newemail@example.com' })
  @NormalizeEmail()
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ description: 'Current password, required to change email' })
  @IsString()
  @IsNotEmpty()
  currentPassword: string;
}
