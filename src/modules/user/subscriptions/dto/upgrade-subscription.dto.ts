import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class UpgradeSubscriptionDto {
  @ApiProperty({
    example: 'plan-uuid-here',
    description: 'New plan ID to upgrade to',
  })
  @IsUUID()
  newPlanId: string;
}
