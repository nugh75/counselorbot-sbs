'use client';

import { useI18n } from '@/lib/i18n-context';
import { cn } from '@/lib/utils';
import { Button } from './Button';

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
            className={cn('inline-flex items-center gap-1.5 rounded-card border border-danger-line bg-danger-soft p-1.5', className)}
        >
            <span className="px-1 text-xs font-semibold text-danger-ink">{question}</span>
            <Button
                type="button"
                variant="danger"
                size="md"
                className="px-2.5 text-xs"
                onClick={onConfirm}
                disabled={busy}
            >
                {t('profile.yes')}
            </Button>
            <Button
                type="button"
                variant="secondary"
                size="md"
                className="px-2.5 text-xs"
                onClick={onCancel}
            >
                {t('profile.no')}
            </Button>
        </div>
    );
}
