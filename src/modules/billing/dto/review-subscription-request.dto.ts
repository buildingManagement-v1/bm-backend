import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RejectSubscriptionRequestDto {
  @ApiProperty({ example: 'Transfer not found in our bank statement' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
