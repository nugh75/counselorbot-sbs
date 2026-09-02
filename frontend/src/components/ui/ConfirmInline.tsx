'use client';

import { useI18n } from '@/lib/i18n-context';
import { cn } from '@/lib/utils';

// Conferma in linea al posto di `window.confirm`. La finestra nativa non segue
// il tema scuro, non traduce le sue etichette e su mobile arriva da un altro
// mondo visivo; questa prende il posto del comando che l'ha aperta, così la
// domanda sta dove stava l'azione e la risposta è a un dito di distanza.
interface ConfirmInlineProps {
    question: string;
    onConfirm: () => void;
    onCancel: () => void;
    busy?: boolean;
    className?: string;
}

export function ConfirmInline({ question, onConfirm, onCancel, busy, className }: ConfirmInlineProps) {
    const { t } = useI18n();
    return (
        <div
            role="group"
            aria-label={question}
            className={cn('inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 p-1.5', className)}
        >
            <span className="px-1 text-xs font-semibold text-red-800">{question}</span>
            <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
            >
                {t('profile.yes')}
            </button>
            <button
                type="button"
                onClick={onCancel}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
            >
                {t('profile.no')}
            </button>
        </div>
    );
}
