import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { normalizePlate } from '../plate.util';

export class VehicleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  @Transform(({ value }) => (typeof value === 'string' ? normalizePlate(value) : value))
  plateNumber: string;

  @IsOptional()
  @IsString()
  vehicleLabel?: string;
}
