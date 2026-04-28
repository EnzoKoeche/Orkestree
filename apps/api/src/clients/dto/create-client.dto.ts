import { ClientType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsEmail,
    IsEnum,
    IsISO8601,
    IsNotEmpty,
    IsOptional,
    IsString,
    Length,
    Matches,
    MaxLength,
    ValidateIf,
    ValidateNested,
} from 'class-validator';
import { SetClientFieldValueItemDto } from './set-client-field-value.dto';

export class CreateClientDto {
    @IsEnum(ClientType)
    type: ClientType;

    // ── INDIVIDUAL: full name (required for PF) ───────────────────────────
    @ValidateIf((o: CreateClientDto) => o.type === ClientType.INDIVIDUAL)
    @IsNotEmpty()
    @IsString()
    @MaxLength(256)
    name?: string;

    // ── BUSINESS: razão social (required for PJ) ──────────────────────────
    @ValidateIf((o: CreateClientDto) => o.type === ClientType.BUSINESS)
    @IsNotEmpty()
    @IsString()
    @MaxLength(256)
    legalName?: string;

    // ── BUSINESS: nome fantasia (optional, drives display name when set) ──
    @IsOptional()
    @IsString()
    @MaxLength(256)
    tradeName?: string;

    // ── Fiscal document ───────────────────────────────────────────────────
    // CPF = 11 digits (PF), CNPJ = 14 digits (PJ). Digits only; formatting
    // must be stripped by the caller before submission.
    @IsOptional()
    @ValidateIf((_, v) => v !== null)
    @IsString()
    @Matches(/^\d{11}$|^\d{14}$/, {
        message: 'taxId must be exactly 11 digits (CPF) or 14 digits (CNPJ).',
    })
    taxId?: string | null;

    // ── Contact ───────────────────────────────────────────────────────────
    @IsOptional()
    @IsEmail()
    @MaxLength(256)
    email?: string;

    @IsOptional()
    @IsString()
    @MaxLength(32)
    phone?: string;

    @IsOptional()
    @IsString()
    @MaxLength(4096)
    notes?: string;

    // ── INDIVIDUAL only ───────────────────────────────────────────────────
    @IsOptional()
    @IsISO8601()
    dateOfBirth?: string;

    // ── BUSINESS only ─────────────────────────────────────────────────────
    @IsOptional()
    @IsString()
    @MaxLength(64)
    stateRegistration?: string;

    @IsOptional()
    @IsString()
    @MaxLength(64)
    municipalRegistration?: string;

    // ── Address ───────────────────────────────────────────────────────────
    @IsOptional()
    @IsString()
    @MaxLength(256)
    addressStreet?: string;

    @IsOptional()
    @IsString()
    @MaxLength(32)
    addressNumber?: string;

    @IsOptional()
    @IsString()
    @MaxLength(128)
    addressComplement?: string;

    @IsOptional()
    @IsString()
    @MaxLength(128)
    addressNeighborhood?: string;

    @IsOptional()
    @IsString()
    @MaxLength(128)
    addressCity?: string;

    @IsOptional()
    @IsString()
    @Length(2, 2)
    addressState?: string;

    @IsOptional()
    @IsString()
    @MaxLength(16)
    addressPostalCode?: string;

    @IsOptional()
    @IsString()
    @Length(2, 4)
    addressCountry?: string;

    // ── Custom field values ───────────────────────────────────────────────
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SetClientFieldValueItemDto)
    fieldValues?: SetClientFieldValueItemDto[];
}
