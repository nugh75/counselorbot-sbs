'use client';

import { useSyncExternalStore } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { getSelectedInstrumentId, subscribeToInstrument } from '@/lib/instrument';
import { instrumentLabel } from '@/lib/instrument-label';
import { QUESTIONNAIRES, QuestionnaireType } from '@/lib/questionnaires';

// Badge compatto nell'header: mostra lo strumento selezionato (se presente),
// accanto al chip del counselor. Compare solo dopo la scelta dello strumento.
export function HeaderInstrument() {
    const { tf } = useI18n();
    const id = useSyncExternalStore(subscribeToInstrument, getSelectedInstrumentId, () => null);
    if (!id) return null;
    const name = instrumentLabel(id, QUESTIONNAIRES[id as QuestionnaireType]?.name, tf);

    return (
        <span
            className="flex min-w-0 items-center rounded-full border border-line bg-surface-sunken px-4 py-1 text-sm text-ink-body"
            title={name}
        >
            <span className="max-w-28 truncate sm:max-w-40">{name}</span>
        </span>
    );
}
