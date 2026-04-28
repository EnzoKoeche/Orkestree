import { IsOptional, IsString, MaxLength } from 'class-validator';

export class TransitionStageDto {
    @IsString()
    toStageId: string;

    @IsOptional()
    @IsString()
    @MaxLength(1024)
    note?: string;
}
