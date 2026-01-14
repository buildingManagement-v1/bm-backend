import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsUUID,
} from 'class-validator';
import { NotificationType, UserType } from 'generated/prisma/client';

export class CreateNotificationDto {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174007' })
  @IsUUID()
  userId: string;

  @ApiProperty({ enum: UserType, example: UserType.platform_admin })
  @IsEnum(UserType)
  userType: UserType;

  @ApiProperty({ enum: NotificationType, example: NotificationType['info'] })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiProperty({ example: 'New Feature Available' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'Check out the new dashboard features.' })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiProperty({ example: '/dashboard/features', required: false })
  @IsOptional()
  @IsString()
  link?: string;
}
