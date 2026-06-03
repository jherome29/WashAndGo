import { IsEnum } from 'class-validator';

enum BookingStatus {
  PENDING = 'PENDING',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  REUPLOAD_REQUIRED = 'REUPLOAD_REQUIRED',
  CONFIRMED = 'CONFIRMED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export class UpdateStatusDto {
  @IsEnum(BookingStatus)
  status: BookingStatus;
}
