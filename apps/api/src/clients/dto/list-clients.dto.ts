import { ClientType } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
    IsBoolean,
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

export class ListClientsDto {
    @IsOptional()
    @IsEnum(ClientType)
    type?: ClientType;

    @IsOptional()
    @Transform(({ value }) => {
        if (value === 'true' || value === true) return true;
        if (value === 'false' || value === false) return false;
        return undefined;
    })
    @IsBoolean()
    isActive?: boolean;

    // Searches name and taxId (case-insensitive, contains).
    @IsOptional()
    @IsString()
    @MaxLength(256)
    search?: string;

    @IsOptional()
    @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : 50))
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number = 50;

    @IsOptional()
    @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : 0))
    @IsInt()
    @Min(0)
    skip?: number = 0;
}
