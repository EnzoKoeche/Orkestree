import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateServiceRequestDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(256)
    title?: string;

    @IsOptional()
    @IsString()
    @MaxLength(4096)
    description?: string;
}
