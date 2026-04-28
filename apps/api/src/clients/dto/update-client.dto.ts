import {
    IsEmail,
    IsISO8601,
    IsOptional,
    IsString,
    Length,
    Matches,
    MaxLength,
    ValidateIf,
} from 'class-validator';

// type is intentionally absent — it is immutable after creation.
// The service enforces type-specific field semantics based on the stored type.
export class UpdateClientDto {
    // ── INDIVIDUAL: full name ─────────────────────────────────────────────
    @IsOptional()
    @IsString()
    @MaxLength(256)
    name?: string;

    // ── BUSINESS: razão social ────────────────────────────────────────────
    @IsOptional()
    @IsString()
    @MaxLength(256)
    legalName?: string;

    // ── BUSINESS: nome fantasia ───────────────────────────────────────────
    @IsOptional()
    @IsString()
    @MaxLength(256)
    tradeName?: string;

    // ── Fiscal document ───────────────────────────────────────────────────
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
}
