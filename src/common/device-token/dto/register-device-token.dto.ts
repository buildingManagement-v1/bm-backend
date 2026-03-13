import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { PushPlatform } from 'generated/prisma/client';

export class RegisterDeviceTokenDto {
  @ApiProperty({
    example: 'fcm_token_abc123...',
    description: 'FCM device token',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ enum: PushPlatform, example: PushPlatform.android })
  @IsEnum(PushPlatform)
  platform: PushPlatform;
}

export class UnregisterDeviceTokenDto {
  @ApiProperty({ example: 'fcm_token_abc123...' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
