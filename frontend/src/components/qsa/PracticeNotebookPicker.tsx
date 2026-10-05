'use client';

// Scelta del taccuino studente di prova, sotto il selettore del taccuino nel
// contesto quando il docente sceglie "Prova". Elenca solo i taccuini attivi
// del docente; la verifica vera (ruolo e proprietà) la fa il server a ogni
// turno. Senza scelta propone il più recente.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n-context';
import type { PracticeNotebook } from '@/lib/practice-notebooks';
import { practiceNotebookApi } from '@/lib/practice-notebooks-api';

interface PracticeNotebookPickerProps {
    value: number | null;
    onChange: (id: number | null) => void;
    disabled?: boolean;
}

export function PracticeNotebookPicker({ value, onChange, disabled = false }: PracticeNotebookPickerProps) {
    const { t } = useI18n();
    const [notebooks, setNotebooks] = useState<PracticeNotebook[] | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        practiceNotebookApi.list(false, controller.signal)
            .then(setNotebooks)
            .catch(() => { if (!controller.signal.aborted) setNotebooks([]); });
        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (notebooks && notebooks.length && value === null) onChange(notebooks[0].id);
    }, [notebooks, value, onChange]);

    if (notebooks === null) return null;
    const missing = value !== null && !notebooks.some((notebook) => notebook.id === value);

    return (
        <div data-practice-notebook-picker className="space-y-1 px-2 pb-1 text-xs text-slate-600">
            {notebooks.length > 0 ? (
                <label className="block space-y-1">
                    <span className="block">{t('notebookContext.practiceNotebook')}</span>
                    <select
                        value={missing || value === null ? '' : String(value)}
                        onChange={(event) => onChange(event.target.value ? Number(event.target.value) : null)}
                        disabled={disabled}
                        className="min-h-[44px] w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                    >
                        {(missing || value === null) && <option value="">{t('notebookContext.practiceChoose')}</option>}
                        {notebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.title}</option>)}
                    </select>
                </label>
            ) : <p>{t('notebookContext.practiceEmpty')}</p>}
            {missing && <p role="status" className="text-amber-700">{t('notebookContext.practiceMissing')}</p>}
            <p className="text-slate-500">{t('notebookContext.practiceHint')}</p>
            <Link href="/docente/taccuini-prova" className="inline-block font-medium text-indigo-700 underline-offset-2 hover:underline">
                {t('notebookContext.practiceManage')}
            </Link>
        </div>
    );
}
