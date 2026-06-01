import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class PaymentDeclineDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  declineReason: string;
}
