import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { NormalizeEmail } from '../../../../common/decorators/normalize-email.decorator';

export class UpdateTenantProfileDto {
  @ApiProperty({ required: false, example: 'tenant@example.com' })
  @IsOptional()
  @NormalizeEmail()
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
