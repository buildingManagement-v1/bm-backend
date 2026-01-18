import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ChangePlanDto {
  @ApiProperty({
    example: 'plan-uuid-here',
    description: 'New plan ID to upgrade/downgrade to',
  })
  @IsString()
  newPlanId: string;
}
