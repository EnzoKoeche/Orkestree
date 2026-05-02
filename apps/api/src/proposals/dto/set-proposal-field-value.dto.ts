import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsISO8601,
    IsNumber,
    IsOptional,
    IsString,
    ValidateIf,
    ValidateNested,
} from 'class-validator';

// ─────────────────────────────────────────────────────────────────────────────
// Mirrors SetFieldValueItemDto / SetClientFieldValueItemDto for proposals.
// PROPOSAL custom fields are not service-type-scoped.
// ─────────────────────────────────────────────────────────────────────────────

export class SetProposalFieldValueItemDto {
    @IsString()
    customFieldId: string;

    @IsOptional()
    @ValidateIf((_, v) => v !== null)
    @IsString()
    valueText?: string | null;

    @IsOptional()
    @ValidateIf((_, v) => v !== null)
    @IsNumber()
    valueNumber?: number | null;

    @IsOptional()
    @ValidateIf((_, v) => v !== null)
    @IsBoolean()
    valueBoolean?: boolean | null;

    @IsOptional()
    @ValidateIf((_, v) => v !== null)
    @IsISO8601()
    valueDate?: string | null;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    valueMulti?: string[];
}

export class SetProposalFieldValuesDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SetProposalFieldValueItemDto)
    fieldValues: SetProposalFieldValueItemDto[];
}
