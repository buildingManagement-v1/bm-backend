import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsUUID, IsEnum } from 'class-validator';
import { MaintenanceRequestPriority } from 'generated/prisma/enums';

export class CreateMaintenanceRequestDto {
  @ApiProperty({ example: 'Leaking pipe' })
  @IsString()
  title: string;

  @ApiProperty({ example: 'Water leaking in the kitchen.' })
  @IsString()
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
}
