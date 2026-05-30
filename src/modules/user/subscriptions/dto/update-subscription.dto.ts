import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { SubscriptionStatus } from 'generated/prisma/enums';

export class UpdateSubscriptionDto {
  @ApiProperty({
    enum: SubscriptionStatus,
    example: SubscriptionStatus['active'],
    required: false,
  })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;
}
