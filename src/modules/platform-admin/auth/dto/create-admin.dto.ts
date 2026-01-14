import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsEnum,
  IsArray,
} from 'class-validator';
import { PlatformAdminRole } from 'generated/prisma/enums';

export class CreateAdminDto {
  @ApiProperty({ example: 'Admin Name' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'admin@bms.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({
    example: ['super_admin'],
    enum: PlatformAdminRole,
    isArray: true,
  })
  @IsArray()
  @IsEnum(PlatformAdminRole, { each: true })
  roles: PlatformAdminRole[];
}
