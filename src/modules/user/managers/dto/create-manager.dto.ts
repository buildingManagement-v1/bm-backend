import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  IsArray,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ManagerRole } from 'generated/prisma/client';

class BuildingRoleAssignment {
  @IsUUID()
  buildingId: string;

  @IsArray()
  roles: ManagerRole[];
}

export class CreateManagerDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsNotEmpty()
  phone?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BuildingRoleAssignment)
  buildingAssignments: BuildingRoleAssignment[];
}
