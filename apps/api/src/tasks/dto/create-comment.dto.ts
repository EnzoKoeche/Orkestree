import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
    @IsString()
    @MinLength(1)
    @MaxLength(4096)
    body: string;
}
