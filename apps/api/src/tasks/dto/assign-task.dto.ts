import { IsString, MaxLength, MinLength } from 'class-validator';

export class AssignTaskDto {
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    membershipId: string;
}
