import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { MaintenanceRequestPriority } from 'generated/prisma/client';

export class SubmitMaintenanceRequestDto {
  @ApiProperty({ example: 'Leaking faucet' })
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'The faucet in the kitchen is leaking.' })
  @IsNotEmpty()
  description: string;

  @ApiProperty({
    enum: MaintenanceRequestPriority,
    example: MaintenanceRequestPriority.medium,
    required: false,
  })
  @IsOptional()
  @IsEnum(MaintenanceRequestPriority)
  priority?: MaintenanceRequestPriority;
}
