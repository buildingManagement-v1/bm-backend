import { IsEnum, IsOptional } from 'class-validator';
import { SubscriptionStatus } from 'generated/prisma/enums';

export class UpdateSubscriptionDto {
  @IsOptional()
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;
}
