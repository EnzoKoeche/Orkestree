import {
    IsDateString,
    IsEnum,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';
import { TaskPriority } from '@prisma/client';

export class UpdateTaskDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(256)
    title?: string;

    @IsOptional()
    @IsString()
    @MaxLength(4096)
    description?: string;

    @IsOptional()
    @IsEnum(TaskPriority)
    priority?: TaskPriority;

    @IsOptional()
    @IsDateString()
    dueAt?: string | null;
}
