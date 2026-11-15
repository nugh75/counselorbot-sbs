'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { cn } from '@/lib/utils';
import { Button } from './Button';

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
            className="min-h-control min-w-0 flex-1 rounded-control border border-line-strong bg-surface px-2 text-sm font-semibold text-ink"
        />
        <Button type="button" size="md" className="px-3 text-xs" onClick={confirm}>{t('common.save')}</Button>
        <Button type="button" variant="secondary" size="md" className="px-3 text-xs" onClick={onCancel}>{t('common.cancel')}</Button>
    </span>;
}
