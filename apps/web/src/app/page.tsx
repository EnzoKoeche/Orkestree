'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { LoadingState } from '@/components/ui/States';

// Root route. Redirects to either the sign-in page or the default home for
// the authenticated app. The "default home" is the Service Requests list,
// which is the operator's primary working surface today.
export default function RootPage() {
    const router = useRouter();
    const { session, loading } = useSession();

    useEffect(() => {
        if (loading) return;
        router.replace(session ? '/requests' : '/sign-in');
    }, [loading, session, router]);

    return (
        <div className="flex min-h-screen items-center justify-center">
            <LoadingState label="Loading Orkestree…" />
        </div>
    );
}
