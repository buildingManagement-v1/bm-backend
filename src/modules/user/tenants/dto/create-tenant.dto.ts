import { IsString, IsEmail, IsOptional, IsUUID, IsEnum } from 'class-validator';
import { TenantStatus } from 'generated/prisma/enums';

export class CreateTenantDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsOptional()
  @IsEnum(TenantStatus as object)
  status?: TenantStatus;
}
