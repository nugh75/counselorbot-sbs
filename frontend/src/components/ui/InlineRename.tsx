'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { cn } from '@/lib/utils';

// F23 (audit Area personale, lotto 4): rinomina in linea al posto del prompt
// nativo del browser, con focus e selezione automatici, invio per confermare
// ed Escape per annullare. Un valore vuoto o invariato non produce chiamate.
interface InlineRenameProps {
    value: string;
    maxLength: number;
    ariaLabel: string;
    onRename: (name: string) => void;
    onCancel: () => void;
    className?: string;
}

export function InlineRename({ value: initial, maxLength, ariaLabel, onRename, onCancel, className }: InlineRenameProps) {
    const { t } = useI18n();
    const [value, setValue] = useState(initial);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const confirm = () => {
        const name = value.trim();
        if (!name || name === initial) { onCancel(); return; }
        onRename(name);
    };

    return <span className={cn('inline-flex min-w-0 flex-1 items-center gap-1', className)}>
        <input
            ref={inputRef}
            value={value}
            maxLength={maxLength}
            aria-label={ariaLabel}
            onChange={event => setValue(event.target.value)}
            onKeyDown={event => {
                if (event.key === 'Enter') { event.preventDefault(); confirm(); }
                if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
            }}
            className="min-h-11 min-w-0 flex-1 rounded-md border border-indigo-300 bg-white px-2 text-sm font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 dark:bg-slate-900 dark:text-slate-100"
        />
        <button type="button" onClick={confirm} className="min-h-11 rounded-md bg-indigo-600 px-3 text-xs font-bold text-white hover:bg-indigo-700">{t('common.save')}</button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300">{t('common.cancel')}</button>
    </span>;
}
