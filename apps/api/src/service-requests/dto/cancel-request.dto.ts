import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelRequestDto {
    @IsOptional()
    @IsString()
    @MaxLength(1024)
    reason?: string;
}
