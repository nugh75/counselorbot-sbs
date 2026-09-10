'use client';

// Il passaggio dalla discussione al tavolo. Apre in una scheda nuova: il
// tavolo e' un posto in cui si sta, e chiuderlo per tornare al messaggio da
// cui si e' partiti perderebbe tutte e due le cose.

import { useState } from 'react';
import { Loader2, Table2 } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { createTavolo } from '@/lib/tavolo';
import { tavoloLabel } from '@/lib/i18n-tavolo';

export function OpenTavoloButton({ sessionId, instrument, counselorId, locale, sourceText, ideaMap,
    className, disabled }: {
    sessionId?: string;
    instrument?: string;
    counselorId?: number | null;
    locale: string;
    // I due semi, esclusivi: il testo di un messaggio, o la mappa di Idea.
    sourceText?: string;
    ideaMap?: unknown;
    className?: string;
    disabled?: boolean;
}) {
    const [busy, setBusy] = useState(false);
    const label = tavoloLabel('openFromChat', locale);

    const open = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const tavolo = await createTavolo({
                session_id: sessionId, instrument, source_text: sourceText, idea_map: ideaMap,
                lang: locale, counselor_id: counselorId ?? undefined,
            });
            const suffix = counselorId ? `?counselor=${counselorId}` : '';
            window.open(`/tavolo/${tavolo.id}${suffix}`, '_blank', 'noopener');
        } catch {
            // Un tavolo che non si apre non deve rompere la conversazione:
            // il bottone torna com'era e la chat resta dov'e'.
        } finally {
            setBusy(false);
        }
    };

    return (
        <Tooltip content={label}>
            <button type="button" aria-label={label} disabled={disabled || busy} onClick={() => void open()}
                className={className}>
                {busy
                    ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    : <Table2 className="h-4 w-4" aria-hidden="true" />}
            </button>
        </Tooltip>
    );
}
