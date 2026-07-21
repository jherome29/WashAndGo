import { IsString, IsNotEmpty, IsOptional, IsDateString, ArrayMinSize, ArrayMaxSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { VehicleDto } from './vehicle.dto';

export class IssueMembershipDto {
  @IsString()
  @IsNotEmpty()
  memberName: string;

  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  // Required — a membership can only be issued to an existing Wash & Go account.
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ValidateNested({ each: true })
  @Type(() => VehicleDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(3)
  vehicles: VehicleDto[];
}
