import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';
import { NormalizeEmail } from '../../../../common/decorators/normalize-email.decorator';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'manager@example.com' })
  @NormalizeEmail()
  @IsEmail()
  email: string;
}
