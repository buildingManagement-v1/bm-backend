import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { AdvertAudience } from 'generated/prisma/enums';

const toBoolean = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;
const emptyToUndefined = ({ value }: { value: unknown }) =>
  value === '' ? undefined : value;

/** Multipart form body; the banner image is the `image` file. */
export class CreateLoginAdvertDto {
  @ApiProperty({ example: 'Manage every building from one place' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @ApiProperty({ required: false, description: 'Empty string clears it' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiProperty({
    required: false,
    example: 'https://example.com/offer',
    description: 'Empty string clears it',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== '')
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true })
  @MaxLength(500)
  linkUrl?: string;

  @ApiProperty({ enum: AdvertAudience, default: 'all' })
  @IsOptional()
  @IsEnum(AdvertAudience)
  audience?: AdvertAudience;

  @ApiProperty({ required: false, default: true })
  @Transform(toBoolean)
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({
    required: false,
    example: '2026-10-01',
    description: 'Empty string clears it',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== '')
  @IsDateString()
  startsAt?: string;

  @ApiProperty({
    required: false,
    example: '2026-12-31',
    description: 'Empty string clears it',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== '')
  @IsDateString()
  endsAt?: string;

  @ApiProperty({
    required: false,
    default: 0,
    description: 'Lower shows first',
  })
  @Transform(emptyToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateLoginAdvertDto extends PartialType(CreateLoginAdvertDto) {}
