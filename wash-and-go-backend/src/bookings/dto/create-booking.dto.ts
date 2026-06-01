import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNotEmpty,
  Matches,
} from 'class-validator';

enum VehicleSize {
  SMALL = 'SMALL',
  MEDIUM = 'MEDIUM',
  LARGE = 'LARGE',
  EXTRA_LARGE = 'EXTRA_LARGE',
}

enum VehicleType {
  VEHICLE = 'VEHICLE',
  MOTORCYCLE = 'MOTORCYCLE',
}

enum FuelType {
  GAS = 'GAS',
  DIESEL = 'DIESEL',
}

enum OilType {
  REGULAR = 'REGULAR',
  SEMI_SYNTHETIC = 'SEMI_SYNTHETIC',
  FULLY_SYNTHETIC = 'FULLY_SYNTHETIC',
}

export class CreateBookingDto {
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @IsString()
  @Matches(/^09\d{9}$/, { message: 'Phone must start with 09 and be 11 digits' })
  customerPhone: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsString()
  @IsNotEmpty()
  serviceId: string;

  @IsEnum(VehicleSize)
  vehicleSize: VehicleSize;

  @IsOptional()
  @IsEnum(VehicleType)
  vehicleType?: VehicleType;

  @IsOptional()
  @IsEnum(FuelType)
  fuelType?: FuelType;

  @IsOptional()
  @IsEnum(OilType)
  oilType?: OilType;

  @IsDateString()
  date: string;

  @IsString()
  @IsNotEmpty()
  timeSlot: string;

  @IsOptional()
  @IsString()
  plateNumber?: string;

  @IsOptional()
  @IsString()
  paymentProofPath?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;
}
