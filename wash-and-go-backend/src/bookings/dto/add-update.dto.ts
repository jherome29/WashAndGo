import { IsString, IsNotEmpty, IsOptional, IsArray, IsUrl } from 'class-validator';

export class AddUpdateDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  imageUrls?: string[];
}
