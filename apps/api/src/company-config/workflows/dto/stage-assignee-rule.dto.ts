import { AssignmentType, Role } from '@prisma/client';
import {
    IsEnum,
    IsOptional,
    IsString,
    ValidateIf,
} from 'class-validator';

export class CreateStageAssigneeRuleDto {
    @IsEnum(AssignmentType)
    assignmentType: AssignmentType;

    @ValidateIf((o: CreateStageAssigneeRuleDto) => o.assignmentType === AssignmentType.ROLE)
    @IsEnum(Role)
    role?: Role;

    @ValidateIf((o: CreateStageAssigneeRuleDto) => o.assignmentType === AssignmentType.USER)
    @IsString()
    membershipId?: string;
}

export class UpdateStageAssigneeRuleDto {
    @IsOptional()
    @IsEnum(AssignmentType)
    assignmentType?: AssignmentType;

    @IsOptional()
    @IsEnum(Role)
    role?: Role;

    @IsOptional()
    @IsString()
    membershipId?: string;
}
