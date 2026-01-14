import { ApiProperty } from '@nestjs/swagger';
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
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174003' })
  @IsUUID()
  buildingId: string;

  @ApiProperty({ example: ['property_manager'] })
  @IsArray()
  roles: ManagerRole[];
}

export class UpdateManagerDto {
  @ApiProperty({ example: 'John Doe', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 'john.doe@example.com', required: false })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ example: 'NewPassword123!', minLength: 8, required: false })
  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;

  @ApiProperty({ example: '+1234567890', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({
    enum: UserStatus,
    example: UserStatus.active,
    required: false,
  })
  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;

  @ApiProperty({ type: [BuildingRoleAssignment], required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BuildingRoleAssignment)
  @IsOptional()
  buildingAssignments?: BuildingRoleAssignment[];
}
