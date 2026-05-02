'use client';

// ─────────────────────────────────────────────────────────────────────────────
// useResource
//
// Tiny data-fetching hook tailored to this app's needs. We're not pulling in
// SWR / React Query yet — the pages that exist today need only:
//   - load on mount (and on key change)
//   - track { loading, data, error } states
//   - refetch on demand (after a mutation)
//
// When a second screen needs cache invalidation across components we'll
// upgrade. Keeping it small now means there's nothing to misconfigure.
// ─────────────────────────────────────────────────────────────────────────────

import { ApiError } from '@/lib/http';
import { useCallback, useEffect, useState } from 'react';

export interface ResourceState<T> {
    data: T | null;
    error: ApiError | Error | null;
    loading: boolean;
    /** Re-run the fetcher; result replaces `data`. */
    refetch: () => void;
}

export function useResource<T>(
    /** Stable key — when it changes, the hook refetches. Pass `null` to skip. */
    key: ReadonlyArray<string | number | boolean | null | undefined> | null,
    fetcher: (signal: AbortSignal) => Promise<T>,
): ResourceState<T> {
    const [data, setData] = useState<T | null>(null);
    const [error, setError] = useState<ApiError | Error | null>(null);
    const [loading, setLoading] = useState(false);
    const [tick, setTick] = useState(0);

    const refetch = useCallback(() => setTick((t) => t + 1), []);

    // Stringify the key for the dependency list. Using the array directly
    // would defeat the dependency comparison.
    const keyHash = key === null ? null : JSON.stringify(key);

    useEffect(() => {
        if (keyHash === null) {
            setData(null);
            setError(null);
            setLoading(false);
            return;
        }
        const ctrl = new AbortController();
        let cancelled = false;

        setLoading(true);
        setError(null);

        fetcher(ctrl.signal)
            .then((value) => {
                if (cancelled) return;
                setData(value);
                setLoading(false);
            })
            .catch((err: unknown) => {
                if (cancelled) return;
                if ((err as { name?: string })?.name === 'AbortError') return;
                setError(err as ApiError | Error);
                setLoading(false);
            });

        return () => {
            cancelled = true;
            ctrl.abort();
        };
        // We deliberately depend on `tick` so refetch() works, and on
        // `keyHash` so changing the key triggers a refetch. The `fetcher`
        // identity is intentionally NOT in deps — callers create it inline
        // and we'd loop forever.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [keyHash, tick]);

    return { data, error, loading, refetch };
}
