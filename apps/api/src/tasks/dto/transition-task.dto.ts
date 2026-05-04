import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { TaskStatus } from '@prisma/client';

export class TransitionTaskDto {
    @IsEnum(TaskStatus)
    toStatus: TaskStatus;

    @IsOptional()
    @IsString()
    @MaxLength(1024)
    note?: string;
}
