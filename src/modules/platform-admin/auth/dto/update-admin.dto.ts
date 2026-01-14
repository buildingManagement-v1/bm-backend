import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
  IsEnum,
  IsArray,
  IsOptional,
} from 'class-validator';
import { PlatformAdminRole, AdminStatus } from 'generated/prisma/client';

export class UpdateAdminDto {
  @ApiProperty({ example: 'Admin Name', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 'admin@bms.com', required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'Password123!', minLength: 8, required: false })
  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;

  @ApiProperty({
    example: ['super_admin'],
    enum: PlatformAdminRole,
    isArray: true,
    required: false,
  })
  @IsArray()
  @IsEnum(PlatformAdminRole, { each: true })
  @IsOptional()
  roles?: PlatformAdminRole[];

  @ApiProperty({ example: 'active', enum: AdminStatus, required: false })
  @IsEnum(AdminStatus)
  @IsOptional()
  status?: AdminStatus;
}
