import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ReuploadProofDto {
  @IsString()
  @IsNotEmpty()
  paymentProofPath: string;

  @IsOptional()
  @IsString()
  statusToken?: string;
}
