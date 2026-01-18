import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpgradeSubscriptionDto {
  @ApiProperty({
    example: 'plan-uuid-here',
    description: 'New plan ID to upgrade to',
  })
  @IsString()
  newPlanId: string;
}
