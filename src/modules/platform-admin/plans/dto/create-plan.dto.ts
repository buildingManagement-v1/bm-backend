import { IsString, IsNotEmpty, IsNumber, IsObject, Min } from 'class-validator';

export class CreatePlanDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @Min(0)
  buildingPrice: number;

  @IsNumber()
  @Min(0)
  managerPrice: number;

  @IsObject()
  features: Record<string, any>;
}
