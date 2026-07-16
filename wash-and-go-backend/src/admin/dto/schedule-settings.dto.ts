import { IsString, IsBoolean, IsOptional, IsInt, Min, Max, IsDateString, IsArray, Matches, MaxLength } from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateScheduleDto {
  @IsOptional()
  @IsString()
  @Matches(HHMM, { message: 'openTime must be HH:MM (24h)' })
  openTime?: string;

  @IsOptional()
  @IsString()
  @Matches(HHMM, { message: 'closeTime must be HH:MM (24h)' })
  closeTime?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  slotIntervalH?: number;

  /** Weekdays the shop is always closed — JS convention: 0=Sun ... 6=Sat */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  closedDays?: number[];
}

export class CreateScheduleOverrideDto {
  @IsDateString()
  overrideDate: string;

  @IsOptional()
  @IsBoolean()
  isClosed?: boolean;

  @IsOptional()
  @IsString()
  @Matches(HHMM, { message: 'customOpen must be HH:MM (24h)' })
  customOpen?: string;

  @IsOptional()
  @IsString()
  @Matches(HHMM, { message: 'customClose must be HH:MM (24h)' })
  customClose?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;
}
