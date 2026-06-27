import { IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price_small?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price_medium?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price_large?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price_extra_large?: number;

  @IsOptional()
  @IsObject()
  lube_prices?: Record<string, number>;
}
