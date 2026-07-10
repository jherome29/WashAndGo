import { IsString, IsNotEmpty } from 'class-validator';

export class ReuploadProofDto {
  @IsString()
  @IsNotEmpty()
  paymentProofPath: string;
}
