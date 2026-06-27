import { IsString, IsNotEmpty } from 'class-validator';

export class GetStatusDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  token: string;
}
