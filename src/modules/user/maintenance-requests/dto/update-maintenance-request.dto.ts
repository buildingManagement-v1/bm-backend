import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { MaintenanceRequestStatus } from 'generated/prisma/enums';

export class UpdateMaintenanceRequestDto {
  @ApiProperty({
    enum: MaintenanceRequestStatus,
    example: MaintenanceRequestStatus['in_progress'],
    required: false,
  })
  @IsEnum(MaintenanceRequestStatus as object)
  @IsOptional()
  status?: MaintenanceRequestStatus;

  @ApiProperty({
    example: 'Technician scheduled for tomorrow.',
    required: false,
  })
  @IsString()
  @IsOptional()
  note?: string;
}
