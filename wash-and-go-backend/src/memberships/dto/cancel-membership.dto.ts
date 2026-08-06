import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CancelMembershipDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
