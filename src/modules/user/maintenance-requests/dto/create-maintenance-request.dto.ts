import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { MaintenanceRequestPriority } from 'generated/prisma/enums';

export class CreateMaintenanceRequestDto {
  @ApiProperty({ example: 'Leaking pipe' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'Water leaking in the kitchen.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  description: string;

  @ApiProperty({
    enum: MaintenanceRequestPriority,
    example: MaintenanceRequestPriority['medium'],
    required: false,
  })
  @IsEnum(MaintenanceRequestPriority as object)
  @IsOptional()
  priority?: MaintenanceRequestPriority;

  @ApiProperty({
    example: '123e4567-e89b-12d3-a456-426614174002',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiProperty({
    required: false,
    description:
      "Unit concerned. Defaults to the tenant's leased unit; omit both for common areas",
  })
  @IsOptional()
  @IsUUID()
  unitId?: string;
}
