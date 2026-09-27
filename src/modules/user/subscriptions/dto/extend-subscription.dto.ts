import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Extend the current cycle (offline renewal payment, goodwill credit, …). */
export class ExtendSubscriptionDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  @Max(36)
  months: number;

  @ApiProperty({ example: 'Compensation for downtime on 12 Sep' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
