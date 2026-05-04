import {
    IsDateString,
    IsEnum,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';
import { TaskPriority } from '@prisma/client';

export class CreateTaskDto {
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    requestId: string;

    @IsString()
    @MinLength(1)
    @MaxLength(256)
    title: string;

    @IsOptional()
    @IsString()
    @MaxLength(4096)
    description?: string;

    @IsOptional()
    @IsEnum(TaskPriority)
    priority?: TaskPriority;

    @IsOptional()
    @IsDateString()
    dueAt?: string;

    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    assignedMembershipId?: string;
}
