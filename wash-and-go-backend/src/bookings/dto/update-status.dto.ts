import { IsEnum } from 'class-validator';

enum BookingStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAYMENT_REVIEW = 'PAYMENT_REVIEW',
  PAYMENT_DECLINED = 'PAYMENT_DECLINED',
  CONFIRMED = 'CONFIRMED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export class UpdateStatusDto {
  @IsEnum(BookingStatus)
  status: BookingStatus;
}
