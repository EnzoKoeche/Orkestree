'use client';

import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { clientsApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { cn } from '@/lib/utils';
import type { ClientListItem } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// ClientCombobox — server-side search via Combobox (Popover + Command).
//
// Flow:
//   - On open: initial fetch with isActive=true&limit=20 (top-of-list).
//   - On every keystroke: debounce 300 ms then fetch with `?search=`.
//   - Each fetch is wrapped in an AbortController so a faster keystroke
//     cancels the in-flight previous request — backend isn't hammered, and
//     we can never render a stale set after a newer search resolved.
//   - Item "Sem cliente" is rendered first as a sentinel value '__none__'
//     so the operator can explicitly "select no client" — distinct from
//     "didn't open the picker yet".
//
// We do NOT cache results between opens. Server-side search results vary
// over time (new clients added, names changed) and the response is small
// (≤20 rows). One fetch per open is fine.
// ─────────────────────────────────────────────────────────────────────────────

const DEBOUNCE_MS = 300;
const FETCH_LIMIT = 20;
const NONE_VALUE = '__none__';

interface Props {
    companyId: string;
    /** clientId or null when "Sem cliente". */
    value: string | null;
    onChange: (next: string | null) => void;
}

export function ClientCombobox({ companyId, value, onChange }: Props) {
    const t = useTranslations('requests.create.fields');
    const tErr = useTranslations('requests.create.errors');

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [clients, setClients] = useState<ClientListItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [hasFetched, setHasFetched] = useState(false);
    /** Selected client cached so the trigger keeps showing the name across
     *  different searches that don't include it. */
    const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

    const abortRef = useRef<AbortController | null>(null);

    // Effect: fetch on open / on debounced query change.
    useEffect(() => {
        if (!open) return;

        const handle = setTimeout(() => {
            abortRef.current?.abort();
            const ac = new AbortController();
            abortRef.current = ac;
            setLoading(true);

            clientsApi
                .list(
                    companyId,
                    {
                        isActive: true,
                        search: query.trim() || undefined,
                        limit: FETCH_LIMIT,
                    },
                    { signal: ac.signal },
                )
                .then((rows) => {
                    if (ac.signal.aborted) return;
                    setClients(rows);
                    setHasFetched(true);
                })
                .catch((err) => {
                    if (ac.signal.aborted) return;
                    const isApi = err instanceof ApiError;
                    // Silent on AbortError; surface real failures to the operator.
                    if (!isApi || err.status !== 0) {
                        console.error('client search failed', err);
                    }
                })
                .finally(() => {
                    if (ac.signal.aborted) return;
                    setLoading(false);
                });
        }, query ? DEBOUNCE_MS : 0);

        return () => {
            clearTimeout(handle);
        };
    }, [open, query, companyId]);

    // Cleanup abort on unmount.
    useEffect(() => {
        return () => abortRef.current?.abort();
    }, []);

    // When the parent supplies a value but we don't have its label yet
    // (e.g. preselected on dialog reopen), show the id stub. The user
    // re-selecting refreshes the label.
    useEffect(() => {
        if (!value) {
            setSelectedLabel(null);
            return;
        }
        const match = clients.find((c) => c.id === value);
        if (match) setSelectedLabel(match.name);
    }, [value, clients]);

    const triggerLabel = value
        ? selectedLabel ?? '…'
        : t('clientPlaceholder');

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className={cn(
                        'h-10 w-full justify-between text-base font-normal',
                        !value && 'text-muted-foreground',
                    )}
                >
                    <span className="truncate">{triggerLabel}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder={t('clientSearchPlaceholder')}
                        value={query}
                        onValueChange={setQuery}
                    />
                    <CommandList>
                        {loading ? (
                            <div
                                className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"
                                role="status"
                                aria-live="polite"
                            >
                                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                                {t('clientLoading')}
                            </div>
                        ) : (
                            <>
                                {hasFetched && clients.length === 0 ? (
                                    <CommandEmpty>
                                        {query.trim()
                                            ? t('clientEmpty')
                                            : t('clientEmptyInitial')}
                                    </CommandEmpty>
                                ) : null}

                                <CommandGroup>
                                    <CommandItem
                                        value={NONE_VALUE}
                                        onSelect={() => {
                                            onChange(null);
                                            setSelectedLabel(null);
                                            setOpen(false);
                                        }}
                                    >
                                        <Check
                                            className={cn(
                                                'mr-2 h-4 w-4',
                                                !value ? 'opacity-100' : 'opacity-0',
                                            )}
                                            aria-hidden="true"
                                        />
                                        <span className="text-muted-foreground">
                                            {t('clientNone')}
                                        </span>
                                    </CommandItem>

                                    {clients.map((c) => (
                                        <CommandItem
                                            key={c.id}
                                            value={c.id}
                                            onSelect={() => {
                                                onChange(c.id);
                                                setSelectedLabel(c.name);
                                                setOpen(false);
                                            }}
                                        >
                                            <Check
                                                className={cn(
                                                    'mr-2 h-4 w-4',
                                                    value === c.id ? 'opacity-100' : 'opacity-0',
                                                )}
                                                aria-hidden="true"
                                            />
                                            <div className="flex flex-col">
                                                <span className="text-sm text-foreground">
                                                    {c.name}
                                                </span>
                                                {c.taxId ? (
                                                    <span className="text-xs text-muted-foreground">
                                                        {c.taxId}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </>
                        )}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
