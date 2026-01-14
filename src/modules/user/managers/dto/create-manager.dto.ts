import { ApiProperty } from '@nestjs/swagger';
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
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174003' })
  @IsUUID()
  buildingId: string;

  @ApiProperty({ example: ['property_manager'] })
  @IsArray()
  roles: ManagerRole[];
}

export class CreateManagerDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'john.doe@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: '+1234567890' })
  @IsString()
  @IsNotEmpty()
  phone?: string;

  @ApiProperty({ type: [BuildingRoleAssignment] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BuildingRoleAssignment)
  buildingAssignments: BuildingRoleAssignment[];
}
