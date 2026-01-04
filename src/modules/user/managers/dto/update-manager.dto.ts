import {
  IsEmail,
  IsString,
  MinLength,
  IsEnum,
  IsOptional,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserStatus, ManagerRole } from 'generated/prisma/client';

class BuildingRoleAssignment {
  @IsUUID()
  buildingId: string;

  @IsArray()
  roles: ManagerRole[];
}

export class UpdateManagerDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BuildingRoleAssignment)
  @IsOptional()
  buildingAssignments?: BuildingRoleAssignment[];
}
