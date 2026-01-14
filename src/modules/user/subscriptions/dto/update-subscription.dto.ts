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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;
}
