'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { PageContainer, PageHeader } from '@/components/shell/PageContainer';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import { clientsApi } from '@/lib/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { ApiError } from '@/lib/http';
import { useRequiredSession } from '@/lib/session';
import { useResource } from '@/lib/use-resource';

// ─────────────────────────────────────────────────────────────────────────────
// Client detail page.
//
// Read-mostly. The two mutating actions today are deactivate / reactivate
// (both wired to the backend POST endpoints). Update / field-values are
// out of scope for the shell — they need the workspace's custom-field
// schema, which the operator UI doesn't yet surface.
// ─────────────────────────────────────────────────────────────────────────────

export default function ClientDetailPage() {
    const session = useRequiredSession();
    const params = useParams<{ clientId: string }>();
    const clientId = params.clientId;
    const toast = useToast();

    const { data, error, loading, refetch } = useResource(
        ['client', session.companyId, clientId],
        (signal) => clientsApi.get(session.companyId, clientId, signal),
    );

    const [confirming, setConfirming] = useState<null | 'deactivate' | 'reactivate'>(null);
    const [busy, setBusy] = useState(false);

    async function runAction() {
        if (!data || !confirming) return;
        setBusy(true);
        try {
            if (confirming === 'deactivate') {
                await clientsApi.deactivate(session.companyId, data.id);
                toast.show('Client deactivated.', 'success');
            } else {
                await clientsApi.reactivate(session.companyId, data.id);
                toast.show('Client reactivated.', 'success');
            }
            setConfirming(null);
            refetch();
        } catch (err) {
            const message =
                err instanceof ApiError ? err.toUserMessage() : 'Operation failed.';
            toast.show(message, 'danger');
        } finally {
            setBusy(false);
        }
    }

    if (loading) {
        return (
            <PageContainer>
                <LoadingState />
            </PageContainer>
        );
    }
    if (error) {
        return (
            <PageContainer>
                <ErrorState error={error} onRetry={refetch} />
            </PageContainer>
        );
    }
    if (!data) return null;

    const addressBits = [
        data.addressStreet,
        data.addressNumber,
        data.addressComplement,
        data.addressNeighborhood,
        data.addressCity ? `${data.addressCity}/${data.addressState ?? ''}` : null,
        data.addressPostalCode,
        data.addressCountry,
    ].filter(Boolean);

    return (
        <PageContainer>
            <PageHeader
                breadcrumb={
                    <Link href="/clients" className="hover:underline">
                        Clients
                    </Link>
                }
                title={
                    <span className="flex items-center gap-3">
                        <span className="font-mono text-sm text-ink-subtle">#{data.number}</span>
                        <span className="truncate">{data.name}</span>
                    </span>
                }
                description={
                    <span>
                        {data.type === 'INDIVIDUAL' ? 'Individual' : 'Business'}
                        <span className="mx-2 text-ink-faint">·</span>
                        Created {formatDateTime(data.createdAt)}
                    </span>
                }
                actions={
                    <>
                        {data.isActive ? (
                            <>
                                <Badge tone="success" dot>
                                    Active
                                </Badge>
                                <Button
                                    variant="secondary"
                                    tone="danger"
                                    onClick={() => setConfirming('deactivate')}
                                >
                                    Deactivate
                                </Button>
                            </>
                        ) : (
                            <>
                                <Badge tone="neutral" dot>
                                    Inactive
                                </Badge>
                                <Button variant="primary" onClick={() => setConfirming('reactivate')}>
                                    Reactivate
                                </Button>
                            </>
                        )}
                    </>
                }
            />

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                <div className="lg:col-span-2 flex flex-col gap-5">
                    <Card>
                        <Card.Header title="Identity" />
                        <Card.Body>
                            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
                                <Detail label="Display name" value={data.name} />
                                <Detail label="Tax ID" value={data.taxId} mono />
                                {data.type === 'BUSINESS' ? (
                                    <>
                                        <Detail label="Legal name" value={data.legalName} />
                                        <Detail label="Trade name" value={data.tradeName} />
                                        <Detail
                                            label="State registration"
                                            value={data.stateRegistration}
                                        />
                                        <Detail
                                            label="Municipal registration"
                                            value={data.municipalRegistration}
                                        />
                                    </>
                                ) : (
                                    <Detail
                                        label="Date of birth"
                                        value={data.dateOfBirth ? formatDate(data.dateOfBirth) : null}
                                    />
                                )}
                            </dl>
                        </Card.Body>
                    </Card>

                    <Card>
                        <Card.Header title="Address" />
                        <Card.Body>
                            {addressBits.length === 0 ? (
                                <p className="text-sm text-ink-faint">No address recorded.</p>
                            ) : (
                                <p className="text-sm text-ink">{addressBits.join(', ')}</p>
                            )}
                        </Card.Body>
                    </Card>

                    {data.notes ? (
                        <Card>
                            <Card.Header title="Notes" />
                            <Card.Body>
                                <p className="whitespace-pre-wrap text-sm text-ink">
                                    {data.notes}
                                </p>
                            </Card.Body>
                        </Card>
                    ) : null}
                </div>

                <div className="flex flex-col gap-5">
                    <Card>
                        <Card.Header title="Contact" />
                        <Card.Body>
                            <dl className="grid grid-cols-1 gap-y-3 text-sm">
                                <Detail label="Email" value={data.email} />
                                <Detail label="Phone" value={data.phone} />
                            </dl>
                        </Card.Body>
                    </Card>
                </div>
            </div>

            <Modal
                open={confirming !== null}
                onClose={() => (busy ? undefined : setConfirming(null))}
                title={
                    confirming === 'deactivate' ? 'Deactivate client?' : 'Reactivate client?'
                }
                description={
                    confirming === 'deactivate'
                        ? 'The client record stays in the database, but new field values cannot be written and they will be hidden from default lists.'
                        : 'The client will become editable and will appear in default lists again.'
                }
                busy={busy}
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={() => setConfirming(null)}
                            disabled={busy}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="primary"
                            tone={confirming === 'deactivate' ? 'danger' : 'neutral'}
                            loading={busy}
                            onClick={runAction}
                        >
                            {confirming === 'deactivate' ? 'Deactivate' : 'Reactivate'}
                        </Button>
                    </>
                }
            />
        </PageContainer>
    );
}

function Detail({
    label,
    value,
    mono,
}: {
    label: string;
    value: string | null | undefined;
    mono?: boolean;
}) {
    return (
        <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-subtle">
                {label}
            </dt>
            <dd
                className={
                    'mt-0.5 ' +
                    (mono ? 'font-mono text-xs ' : 'text-sm ') +
                    (value ? 'text-ink' : 'text-ink-faint')
                }
            >
                {value ?? '—'}
            </dd>
        </div>
    );
}
