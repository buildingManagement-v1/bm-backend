import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsArray,
  ArrayNotEmpty,
  ArrayUnique,
  IsEnum,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ManagerRole } from 'generated/prisma/client';
import { NormalizeEmail } from '../../../../common/decorators/normalize-email.decorator';

class BuildingRoleAssignment {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174003' })
  @IsUUID()
  buildingId: string;

  @ApiProperty({ example: ['property_manager'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(ManagerRole, { each: true })
  roles: ManagerRole[];
}

export class CreateManagerDto {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'john.doe@example.com' })
  @NormalizeEmail()
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+1234567890' })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiProperty({ type: [BuildingRoleAssignment] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique((a: BuildingRoleAssignment) => a.buildingId, {
    message: 'Each building can only be assigned once',
  })
  @ValidateNested({ each: true })
  @Type(() => BuildingRoleAssignment)
  buildingAssignments: BuildingRoleAssignment[];
}
