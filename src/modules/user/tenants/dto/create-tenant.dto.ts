import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail, IsOptional, IsUUID, IsEnum } from 'class-validator';
import { TenantStatus } from 'generated/prisma/enums';

export class CreateTenantDto {
  @ApiProperty({ example: 'Alice Smith' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'alice@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+1234567890', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174006',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiProperty({
    enum: TenantStatus,
    example: TenantStatus['active'],
    required: false,
  })
  @IsOptional()
  @IsEnum(TenantStatus as object)
  status?: TenantStatus;

  @ApiProperty({ example: 'Password123!', required: false })
  @IsOptional()
  @IsString()
  password?: string;
}
