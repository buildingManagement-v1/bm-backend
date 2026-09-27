import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AnnouncementPriority } from 'generated/prisma/enums';

export class CreateAnnouncementDto {
  @ApiProperty({ example: 'Water shutdown on Saturday' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: 'Water will be off from 9am to 1pm for repairs.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content!: string;

  @ApiProperty({ enum: AnnouncementPriority, required: false })
  @IsOptional()
  @IsEnum(AnnouncementPriority)
  priority?: AnnouncementPriority;

  @ApiProperty({
    required: false,
    example: '2026-10-31',
    description: 'Hide from tenants after this date',
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @ApiProperty({
    required: false,
    default: true,
    description: 'Publish now (notifies tenants) or save as a draft',
  })
  @IsOptional()
  @IsBoolean()
  publish?: boolean;
}
