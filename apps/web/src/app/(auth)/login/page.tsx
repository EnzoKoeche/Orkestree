'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { useSession } from '@/lib/session';

// ─────────────────────────────────────────────────────────────────────────────
// Login page
//
// Single screen, single form. The only place in the app where indigo
// (`bg-primary`) surfaces in chrome — every primary action elsewhere
// inherits the same colour, but this is operator-visit #1 so the cue
// matters more here.
//
// Validation strategy:
//   - Client (zod + react-hook-form): inline below the input that failed,
//     never via toast. Validation errors are about the user's INPUT, so
//     they belong next to the input.
//   - Remote (ApiError from authApi.login): always via sonner toast. Toast
//     surfaces are short-lived, dismissible, and keep the operator's
//     position in the form so they can correct and retry.
//
// Loading state: the button label flips to "Entrando…" with a spinner
// (Loader2 animate-spin). Inputs and submit go disabled. aria-busy on the
// form so assistive tech announces the request in flight.
//
// Success: redirect silently to /. No "Welcome back" toast — that belongs
// to lifestyle apps; B2B premium just lets the operator continue.
// ─────────────────────────────────────────────────────────────────────────────

export default function LoginPage() {
    const t = useTranslations('signIn');
    const router = useRouter();
    const { signIn } = useSession();
    const [submitting, setSubmitting] = useState(false);

    const schema = z.object({
        email: z
            .string()
            .min(1, t('errors.emailRequired'))
            .email(t('errors.emailInvalid')),
        password: z.string().min(1, t('errors.passwordRequired')),
    });

    type FormValues = z.infer<typeof schema>;

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { email: '', password: '' },
        mode: 'onSubmit',
    });

    async function onSubmit(values: FormValues) {
        setSubmitting(true);
        try {
            const result = await authApi.login(values.email.trim(), values.password);
            signIn({ token: result.accessToken, user: result.user });
            router.push('/');
        } catch (err) {
            setSubmitting(false);
            if (err instanceof ApiError) {
                if (err.isUnauthorized()) {
                    toast.error(t('errors.invalidCredentials'));
                } else if (err.isThrottled()) {
                    toast.error(t('errors.tooManyAttempts'));
                } else if (err.isServerError()) {
                    toast.error(t('errors.serverError'));
                } else if (err.isNetworkError()) {
                    toast.error(t('errors.networkError'));
                } else {
                    // Other 4xx — surface server-provided message if present,
                    // otherwise fall back to the generic server-error copy
                    // (still humane, never raw HTTP jargon).
                    const message = err.toUserMessage();
                    toast.error(message || t('errors.serverError'));
                }
            } else {
                // Should not happen — request() funnels everything through
                // ApiError. Treat as network for the user.
                toast.error(t('errors.networkError'));
            }
        }
    }

    return (
        <div className="w-full max-w-sm">
            <Logo size="md" />

            <h1 className="mt-8 text-2xl font-semibold tracking-tight text-foreground">
                {t('title')}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">{t('subtitle')}</p>

            <Card className="mt-6 p-8">
                <form
                    onSubmit={handleSubmit(onSubmit)}
                    aria-busy={submitting}
                    noValidate
                >
                    <div className="flex flex-col gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="email">{t('emailLabel')}</Label>
                            <Input
                                id="email"
                                type="email"
                                autoComplete="email"
                                autoFocus
                                placeholder={t('emailPlaceholder')}
                                disabled={submitting}
                                aria-invalid={errors.email ? 'true' : 'false'}
                                className="h-10"
                                {...register('email')}
                            />
                            {errors.email ? (
                                <p className="text-sm text-destructive" role="alert">
                                    {errors.email.message}
                                </p>
                            ) : null}
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="password">{t('passwordLabel')}</Label>
                            <Input
                                id="password"
                                type="password"
                                autoComplete="current-password"
                                disabled={submitting}
                                aria-invalid={errors.password ? 'true' : 'false'}
                                className="h-10"
                                {...register('password')}
                            />
                            {errors.password ? (
                                <p className="text-sm text-destructive" role="alert">
                                    {errors.password.message}
                                </p>
                            ) : null}
                        </div>
                    </div>

                    <Button
                        type="submit"
                        className="mt-6 h-10 w-full"
                        disabled={submitting}
                    >
                        {submitting ? (
                            <>
                                <Loader2
                                    className="mr-2 h-4 w-4 animate-spin"
                                    aria-hidden="true"
                                />
                                {t('submitting')}
                            </>
                        ) : (
                            t('submit')
                        )}
                    </Button>
                </form>
            </Card>
        </div>
    );
}
