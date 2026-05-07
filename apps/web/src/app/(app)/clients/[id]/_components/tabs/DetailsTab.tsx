import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { getTranslations } from 'next-intl/server';
import type {
    ClientDetail,
    ClientFieldValue,
    CustomFieldType,
} from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// DetailsTab — read-only view of a client's stored data.
//
// 4 sections in order: Informações, Endereço, Campos personalizados,
// Observações. Each section is its own block with a muted uppercase title;
// fields are stacked label-on-top in a 2-col grid (sm+).
//
// Section visibility:
//   - Informações: always rendered (PF/PJ branches conditionally).
//   - Endereço: rendered always; if every address field is null, shows a
//     single "Endereço não cadastrado." line instead of a wall of dashes.
//   - Campos personalizados: rendered only if fieldValues has at least one
//     entry. Empty section = hidden entirely (cleaner than empty grid).
//   - Observações: always rendered with fallback when notes is null.
// ─────────────────────────────────────────────────────────────────────────────

export async function DetailsTab({
    client,
    fieldValues,
}: {
    client: ClientDetail;
    fieldValues: ClientFieldValue[];
}) {
    const t = await getTranslations('clients.detail.details');
    const tFields = await getTranslations('clients.detail.details.fields');

    const isPF = client.type === 'INDIVIDUAL';
    const isPJ = client.type === 'BUSINESS';

    const hasAnyAddress =
        Boolean(client.addressStreet) ||
        Boolean(client.addressNumber) ||
        Boolean(client.addressComplement) ||
        Boolean(client.addressNeighborhood) ||
        Boolean(client.addressCity) ||
        Boolean(client.addressState) ||
        Boolean(client.addressPostalCode);

    return (
        <div className="space-y-8 rounded-md border bg-card p-6">
            {/* ── Informações ─────────────────────────────────────────── */}
            <section>
                <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                    {t('infoTitle')}
                </h2>
                <dl className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                    {isPF ? (
                        <>
                            <Field label={tFields('name')} value={client.name} />
                            <Field
                                label={tFields('dateOfBirth')}
                                value={formatDate(client.dateOfBirth)}
                            />
                        </>
                    ) : isPJ ? (
                        <>
                            <Field
                                label={tFields('legalName')}
                                value={client.legalName}
                            />
                            <Field
                                label={tFields('tradeName')}
                                value={client.tradeName}
                            />
                            <Field
                                label={tFields('stateRegistration')}
                                value={client.stateRegistration}
                            />
                            <Field
                                label={tFields('municipalRegistration')}
                                value={client.municipalRegistration}
                            />
                        </>
                    ) : null}
                    <Field
                        label={tFields('taxId')}
                        value={client.taxId ? formatTaxId(client.taxId) : null}
                        tabular
                    />
                    <Field label={tFields('email')} value={client.email} />
                    <Field label={tFields('phone')} value={client.phone} />
                </dl>
            </section>

            {/* ── Endereço ────────────────────────────────────────────── */}
            <section>
                <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                    {t('addressTitle')}
                </h2>
                {hasAnyAddress ? (
                    <dl className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                        <Field
                            label={tFields('addressStreet')}
                            value={client.addressStreet}
                        />
                        <Field
                            label={tFields('addressNumber')}
                            value={client.addressNumber}
                        />
                        <Field
                            label={tFields('addressComplement')}
                            value={client.addressComplement}
                        />
                        <Field
                            label={tFields('addressNeighborhood')}
                            value={client.addressNeighborhood}
                        />
                        <Field
                            label={tFields('addressCity')}
                            value={client.addressCity}
                        />
                        <Field
                            label={tFields('addressState')}
                            value={client.addressState}
                        />
                        <Field
                            label={tFields('addressPostalCode')}
                            value={client.addressPostalCode}
                        />
                        <Field
                            label={tFields('addressCountry')}
                            value={client.addressCountry}
                        />
                    </dl>
                ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                        {t('noAddress')}
                    </p>
                )}
            </section>

            {/* ── Campos personalizados ──────────────────────────────── */}
            {fieldValues.length > 0 ? (
                <section>
                    <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                        {t('customFieldsTitle')}
                    </h2>
                    <dl className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                        {fieldValues.map((fv) => (
                            <Field
                                key={fv.id}
                                label={fv.customField.label}
                                value={renderFieldValue(fv)}
                            />
                        ))}
                    </dl>
                </section>
            ) : null}

            {/* ── Observações ─────────────────────────────────────────── */}
            <section>
                <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                    {t('notesTitle')}
                </h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                    {client.notes?.trim() || (
                        <span className="text-muted-foreground">{t('noNotes')}</span>
                    )}
                </p>
            </section>
        </div>
    );
}

function Field({
    label,
    value,
    tabular,
}: {
    label: string;
    value: string | null;
    tabular?: boolean;
}) {
    return (
        <div className="flex flex-col gap-1">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                {label}
            </dt>
            <dd className={tabular ? 'text-sm tabular-nums text-foreground' : 'text-sm text-foreground'}>
                {value && value.trim() !== '' ? value : (
                    <span className="text-muted-foreground">—</span>
                )}
            </dd>
        </div>
    );
}

function renderFieldValue(fv: ClientFieldValue): string | null {
    const t: CustomFieldType = fv.customField.type;
    switch (t) {
        case 'NUMBER':
        case 'DECIMAL':
            return fv.valueNumber ?? null;
        case 'BOOLEAN':
            if (fv.valueBoolean === null) return null;
            return fv.valueBoolean ? 'Sim' : 'Não';
        case 'DATE':
            return formatDate(fv.valueDate);
        case 'DATETIME':
            return formatDate(fv.valueDate, true);
        case 'MULTISELECT':
            return fv.valueMulti.length > 0 ? fv.valueMulti.join(', ') : null;
        case 'TEXT':
        case 'TEXTAREA':
        case 'SELECT':
        case 'PHONE':
        case 'EMAIL':
        case 'URL':
        case 'FILE':
        default:
            return fv.valueText && fv.valueText.trim() !== '' ? fv.valueText : null;
    }
}

function formatDate(iso: string | null, withTime = false): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return format(date, withTime ? "d 'de' MMM 'de' yyyy 'às' HH:mm" : "d 'de' MMM 'de' yyyy", {
        locale: ptBR,
    });
}

function formatTaxId(raw: string): string {
    if (raw.length === 11) {
        return `${raw.slice(0, 3)}.${raw.slice(3, 6)}.${raw.slice(6, 9)}-${raw.slice(9)}`;
    }
    if (raw.length === 14) {
        return `${raw.slice(0, 2)}.${raw.slice(2, 5)}.${raw.slice(5, 8)}/${raw.slice(8, 12)}-${raw.slice(12)}`;
    }
    return raw;
}
