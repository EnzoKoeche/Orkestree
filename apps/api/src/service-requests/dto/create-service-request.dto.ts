import { Type } from 'class-transformer';
import {
    IsArray,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
    ValidateNested,
} from 'class-validator';
import { SetFieldValueItemDto } from './set-field-value.dto';

export class CreateServiceRequestDto {
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    serviceTypeId: string;

    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    clientId?: string;

    @IsString()
    @MinLength(1)
    @MaxLength(256)
    title: string;

    @IsOptional()
    @IsString()
    @MaxLength(4096)
    description?: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SetFieldValueItemDto)
    fieldValues?: SetFieldValueItemDto[];
}
