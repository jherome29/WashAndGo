import { IsString, IsNotEmpty, IsOptional, IsArray, IsUrl, IsEnum } from 'class-validator';
import { BookingStatus } from './update-status.dto';

export class AddUpdateDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  imageUrls?: string[];

  /** Optional status to apply alongside this note in a single request — keeps a
   * combined "status change + note" admin action down to one customer email. */
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}
