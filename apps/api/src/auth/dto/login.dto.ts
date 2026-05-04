import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

// ─────────────────────────────────────────────────────────────────────────────
// LoginDto
//
// Minimal credential shape. The repo's User model has `email` (unique) +
// `passwordHash` and nothing else identity-shaped, so an email/password pair
// is the only sane input. SSO/OAuth/passkeys are explicitly out of scope.
// ─────────────────────────────────────────────────────────────────────────────

export class LoginDto {
    @IsEmail()
    @MaxLength(254) // RFC 5321
    email!: string;

    @IsString()
    @MinLength(1)
    @MaxLength(256)
    password!: string;
}
