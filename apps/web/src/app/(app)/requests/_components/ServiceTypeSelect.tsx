'use client';

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type { ServiceTypeListItem } from '@/types/domain';

// Wraps shadcn Select + the active service-types list. Empty/disabled state
// when the company has no active service types — the picker stays mounted
// so the form's required validation still kicks in when the user tries to
// submit blank.

interface Props {
    id?: string;
    value: string;
    onValueChange: (value: string) => void;
    serviceTypes: ServiceTypeListItem[];
    placeholder: string;
}

export function ServiceTypeSelect({
    id,
    value,
    onValueChange,
    serviceTypes,
    placeholder,
}: Props) {
    return (
        <Select
            value={value || undefined}
            onValueChange={onValueChange}
            disabled={serviceTypes.length === 0}
        >
            <SelectTrigger id={id} className="h-10 text-base">
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {serviceTypes.map((st) => (
                    <SelectItem key={st.id} value={st.id}>
                        {st.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
