import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class VehicleDto {
  @IsString()
  @IsNotEmpty()
  plateNumber: string;

  @IsOptional()
  @IsString()
  vehicleLabel?: string;
}
