import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail, IsOptional, IsEnum } from 'class-validator';
import { TenantStatus } from 'generated/prisma/enums';

export class UpdateTenantDto {
  @ApiProperty({ example: 'Alice Smith', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 'alice@example.com', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: '+1234567890', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({
    enum: TenantStatus,
    example: TenantStatus['active'],
    required: false,
  })
  @IsOptional()
  @IsEnum(TenantStatus as object)
  status?: TenantStatus;
}
