import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateStageTransitionDto {
    @IsString()
    fromStageId: string;

    @IsString()
    toStageId: string;

    @IsOptional()
    @IsBoolean()
    requiresApproval?: boolean;
}

export class UpdateStageTransitionDto {
    @IsOptional()
    @IsBoolean()
    requiresApproval?: boolean;
}
