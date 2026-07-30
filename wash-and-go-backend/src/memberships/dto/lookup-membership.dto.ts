import { IsString, IsNotEmpty } from 'class-validator';

export class LookupMembershipDto {
  @IsString()
  @IsNotEmpty()
  membershipNo: string;
}
