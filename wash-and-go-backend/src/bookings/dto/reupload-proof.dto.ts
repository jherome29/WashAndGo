import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class ReuploadProofDto {
  @IsString()
  @IsNotEmpty()
  paymentProofPath: string;

  @IsString()
  @IsNotEmpty()
  statusToken: string;
}
