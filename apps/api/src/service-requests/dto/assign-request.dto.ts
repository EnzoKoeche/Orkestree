import { IsString } from 'class-validator';

export class AssignRequestDto {
    @IsString()
    membershipId: string;
}
