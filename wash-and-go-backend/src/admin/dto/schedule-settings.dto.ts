import { IsString, IsBoolean, IsOptional, IsInt, Min, Max, IsDateString } from 'class-validator';

export class UpdateScheduleDto {
  @IsOptional()
  @IsString()
  openTime?: string;

  @IsOptional()
  @IsString()
  closeTime?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  slotIntervalH?: number;
}

export class CreateScheduleOverrideDto {
  @IsDateString()
  overrideDate: string;

  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;

  @IsOptional()
  @IsString()
  customOpen?: string;

  @IsOptional()
  @IsString()
  customClose?: string;

  @IsOptional()
  @IsString()
  label?: string;
}
