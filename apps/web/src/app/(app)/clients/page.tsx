'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { PageContainer, PageHeader } from '@/components/shell/PageContainer';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Input';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { Table } from '@/components/ui/Table';
import { clientsApi } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useRequiredSession } from '@/lib/session';
import { useResource } from '@/lib/use-resource';
import { ClientType } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// Clients — list page
//
// Backend supports: type, isActive, search (name + taxId), limit, skip.
// We expose all four. The search box is debounced via the resource key
// (a tiny setTimeout is overkill here — typing N chars triggers N renders
// but the abort controller in useResource guarantees only the last fetch
// resolves into state).
// ─────────────────────────────────────────────────────────────────────────────

type ActiveFilter = 'all' | 'active' | 'inactive';
type TypeFilter = 'all' | ClientType;

export default function ClientsListPage() {
    const session = useRequiredSession();
    const [active, setActive] = useState<ActiveFilter>('active');
    const [type, setType] = useState<TypeFilter>('all');
    const [search, setSearch] = useState('');

    const query = useMemo(
        () => ({
            isActive: active === 'all' ? undefined : active === 'active',
            type: type === 'all' ? undefined : type,
            search: search.trim() || undefined,
            limit: 100,
        }),
        [active, type, search],
    );

    const { data, error, loading, refetch } = useResource(
        ['clients', session.companyId, active, type, search.trim()],
        (signal) => clientsApi.list(session.companyId, query, signal),
    );

    return (
        <PageContainer>
            <PageHeader
                title="Clients"
                description="Individuals and businesses this workspace serves."
            />

            <Card>
                <Card.Header
                    title="Directory"
                    actions={
                        <div className="flex items-end gap-3">
                            <Field label="Status" htmlFor="active">
                                <Select
                                    id="active"
                                    value={active}
                                    onChange={(e) => setActive(e.target.value as ActiveFilter)}
                                >
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                    <option value="all">All</option>
                                </Select>
                            </Field>
                            <Field label="Type" htmlFor="type">
                                <Select
                                    id="type"
                                    value={type}
                                    onChange={(e) => setType(e.target.value as TypeFilter)}
                                >
                                    <option value="all">All</option>
                                    <option value="INDIVIDUAL">Individual</option>
                                    <option value="BUSINESS">Business</option>
                                </Select>
                            </Field>
                            <Field label="Search" htmlFor="search">
                                <Input
                                    id="search"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Name or tax ID"
                                    autoComplete="off"
                                />
                            </Field>
                        </div>
                    }
                />
                <Card.Body padded={false}>
                    {loading ? (
                        <LoadingState />
                    ) : error ? (
                        <ErrorState error={error} onRetry={refetch} />
                    ) : !data || data.length === 0 ? (
                        <EmptyState
                            title="No clients match these filters"
                            description="Adjust the filters above or clear the search."
                        />
                    ) : (
                        <Table>
                            <Table.Head>
                                <tr>
                                    <Table.Cell head className="w-20">#</Table.Cell>
                                    <Table.Cell head>Name</Table.Cell>
                                    <Table.Cell head>Type</Table.Cell>
                                    <Table.Cell head>Tax ID</Table.Cell>
                                    <Table.Cell head>Email</Table.Cell>
                                    <Table.Cell head>Phone</Table.Cell>
                                    <Table.Cell head>Status</Table.Cell>
                                    <Table.Cell head>Created</Table.Cell>
                                </tr>
                            </Table.Head>
                            <Table.Body>
                                {data.map((c) => (
                                    <Table.Row key={c.id}>
                                        <Table.Cell>
                                            <Link
                                                href={`/clients/${c.id}`}
                                                className="font-mono text-sm text-ink hover:underline"
                                            >
                                                #{c.number}
                                            </Link>
                                        </Table.Cell>
                                        <Table.Cell>
                                            <Link
                                                href={`/clients/${c.id}`}
                                                className="block max-w-md truncate font-medium text-ink hover:underline"
                                                title={c.name}
                                            >
                                                {c.name}
                                            </Link>
                                        </Table.Cell>
                                        <Table.Cell>
                                            <Badge tone="neutral">
                                                {c.type === 'INDIVIDUAL' ? 'Individual' : 'Business'}
                                            </Badge>
                                        </Table.Cell>
                                        <Table.Cell>
                                            <span className="font-mono text-xs text-ink">{c.taxId ?? '—'}</span>
                                        </Table.Cell>
                                        <Table.Cell>{c.email ?? '—'}</Table.Cell>
                                        <Table.Cell>{c.phone ?? '—'}</Table.Cell>
                                        <Table.Cell>
                                            {c.isActive ? (
                                                <Badge tone="success" dot>
                                                    Active
                                                </Badge>
                                            ) : (
                                                <Badge tone="neutral" dot>
                                                    Inactive
                                                </Badge>
                                            )}
                                        </Table.Cell>
                                        <Table.Cell>
                                            <span className="text-sm text-ink-subtle">
                                                {formatDate(c.createdAt)}
                                            </span>
                                        </Table.Cell>
                                    </Table.Row>
                                ))}
                            </Table.Body>
                        </Table>
                    )}
                </Card.Body>
            </Card>
        </PageContainer>
    );
}
