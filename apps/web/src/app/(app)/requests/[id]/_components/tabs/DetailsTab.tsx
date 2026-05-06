import { getTranslations } from 'next-intl/server';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type {
    CustomFieldType,
    RequestFieldValue,
    ServiceRequestDetail,
} from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// DetailsTab — the "all the data, nothing fancy" tab.
//
// Two sections: descrição (always present, shows fallback when null) and
// custom fields (rendered from the typed columns the backend already
// resolved per-fieldType). Both use a <dl> rhythm with muted labels above
// foreground values — same vocabulary as the header info row, scaled up.
//
// Field rendering: backend stores the value in exactly one of valueText /
// valueNumber / valueBoolean / valueDate / valueMulti depending on the
// field's type. We dispatch on type and format on the server. Anything
// unrecognised falls back to valueText (or "—") — defensive, since the
// CustomFieldType enum may grow without the frontend rebuilding.
// ─────────────────────────────────────────────────────────────────────────────

export async function DetailsTab({
    request,
    fieldValues,
}: {
    request: ServiceRequestDetail;
    fieldValues: RequestFieldValue[];
}) {
    const t = await getTranslations('requests.detail.details');

    return (
        <div className="space-y-8 rounded-md border bg-card p-6">
            <section>
                <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                    {t('descriptionTitle')}
                </h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">
                    {request.description?.trim() || (
                        <span className="text-muted-foreground">{t('noDescription')}</span>
                    )}
                </p>
            </section>

            <section>
                <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                    {t('fieldsTitle')}
                </h2>
                {fieldValues.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">{t('noFields')}</p>
                ) : (
                    <dl className="mt-3 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                        {fieldValues.map((fv) => (
                            <div key={fv.id} className="flex flex-col gap-1">
                                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                                    {fv.customField.label}
                                </dt>
                                <dd className="text-sm text-foreground">
                                    {renderFieldValue(fv) ?? (
                                        <span className="text-muted-foreground">
                                            {t('noValue')}
                                        </span>
                                    )}
                                </dd>
                            </div>
                        ))}
                    </dl>
                )}
            </section>
        </div>
    );
}

function renderFieldValue(fv: RequestFieldValue): string | null {
    const t: CustomFieldType = fv.customField.type;
    switch (t) {
        case 'NUMBER':
        case 'DECIMAL':
            return fv.valueNumber ?? null;
        case 'BOOLEAN':
            if (fv.valueBoolean === null) return null;
            return fv.valueBoolean ? 'Sim' : 'Não';
        case 'DATE':
            return formatDate(fv.valueDate, false);
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

function formatDate(iso: string | null, withTime: boolean): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return format(date, withTime ? "d 'de' MMM 'de' yyyy 'às' HH:mm" : "d 'de' MMM 'de' yyyy", {
        locale: ptBR,
    });
}
