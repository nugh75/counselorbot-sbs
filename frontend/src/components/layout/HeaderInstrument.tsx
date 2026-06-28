'use client';

import { useSyncExternalStore } from 'react';
import { getSelectedInstrumentId, subscribeToInstrument } from '@/lib/instrument';
import { QUESTIONNAIRES, QuestionnaireType } from '@/lib/questionnaires';

// Badge compatto nell'header: mostra lo strumento selezionato (se presente),
// accanto al chip del counselor. Compare solo dopo la scelta dello strumento.
export function HeaderInstrument() {
    const id = useSyncExternalStore(subscribeToInstrument, getSelectedInstrumentId, () => null);
    if (!id) return null;
    const name = QUESTIONNAIRES[id as QuestionnaireType]?.name ?? id;

    return (
        <span
            className="flex min-w-0 items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700"
            title={name}
        >
            <span className="max-w-28 truncate sm:max-w-40">{name}</span>
        </span>
    );
}
