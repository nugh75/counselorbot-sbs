'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
    fetchCounselors,
    getSelectedCounselorId,
    subscribeToCounselor,
    PublicCounselor,
} from '@/lib/counselor';
import { useI18n } from '@/lib/i18n-context';

// Chip compatto nell'header: mostra il counselor selezionato (se presente) e
// mantiene il contesto durante il percorso. Il cambio avviene solo nello step
// dedicato, prima di iniziare un nuovo strumento.
export function HeaderCounselor() {
    const { t } = useI18n();
    const selectedId = useSyncExternalStore(
        subscribeToCounselor,
        getSelectedCounselorId,
        () => null,
    );
    const [counselors, setCounselors] = useState<PublicCounselor[]>([]);

    useEffect(() => {
        let active = true;
        fetchCounselors().then((list) => { if (active) setCounselors(list); });
        return () => { active = false; };
    }, []);

    const selected = counselors.find((c) => c.id === selectedId) || null;
    if (!selected) return null;

    return (
        <div
            className="flex min-w-0 items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700"
            title={t('header.counselorChosen', { name: selected.name })}
        >
            <span className="max-w-28 truncate sm:max-w-40">{selected.name}</span>
        </div>
    );
}
