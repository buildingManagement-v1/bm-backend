import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export const BROADCAST_AUDIENCES = [
  'owners',
  'managers',
  'tenants',
  'everyone',
] as const;
export type BroadcastAudience = (typeof BROADCAST_AUDIENCES)[number];

export class CreateBroadcastDto {
  @ApiProperty({ example: 'Scheduled maintenance tonight' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @ApiProperty({ example: 'The app will be unavailable from 11pm to 1am.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  message!: string;

  @ApiProperty({ enum: BROADCAST_AUDIENCES })
  @IsIn(BROADCAST_AUDIENCES)
  audience!: BroadcastAudience;

  @ApiProperty({
    required: false,
    example: '/dashboard/subscriptions',
    description: 'In-app path to open when tapped',
  })
  @IsOptional()
  @Matches(/^\/[\w\-/?=&.]*$/, {
    message: 'link must be an in-app path like /dashboard',
  })
  @MaxLength(200)
  link?: string;
}
