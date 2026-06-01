import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class UpdatePaymentSettingsDto {
  @IsString()
  @IsNotEmpty()
  paymentMethod: string;

  @IsString()
  @IsNotEmpty()
  accountName: string;

  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  @IsOptional()
  @IsString()
  qrImagePath?: string;
}
