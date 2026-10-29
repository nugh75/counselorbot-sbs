'use client';

import type { ReactNode } from 'react';
import { AlignLeft, Brain, Rows3 } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { chatPreferenceLabel, type ResponseFormat } from '@/lib/chat-preferences';
import type { Lang } from '@/lib/i18n';
import { ResponseFormatSelector } from '@/components/ui/ResponseFormatSelector';
import { ResponseLengthSelector, type ResponseLength } from '@/components/ui/ResponseLengthSelector';
import { ReasoningSelector, type ReasoningEffort } from '@/components/ui/ReasoningSelector';

// Righe formato / lunghezza / ragionamento del popover «Opzioni» (#657):
// stesso ordine, icone ed etichette in chat guidata, Bussola e Assistente.
// Ogni chat passa solo le impostazioni che il suo backend accetta.
export function ChatResponseSettings({ format, length, reasoning, locale, children }: {
    format: { value: ResponseFormat; onChange: (value: ResponseFormat) => void; disabled?: boolean };
    length?: { value: ResponseLength; onChange: (value: ResponseLength) => void; disabled?: boolean };
    reasoning?: { value: ReasoningEffort; onChange: (value: ReasoningEffort) => void; disabled?: boolean; mandatory?: boolean };
    // Lingua della sessione guidata, se diversa da quella dell'interfaccia.
    locale?: Lang;
    // Righe extra (es. quaderno del docente) fra lunghezza e ragionamento, come nella guidata.
    children?: ReactNode;
}) {
    const { t, lang } = useI18n();
    return <div className="space-y-1 py-2" data-testid="chat-response-settings">
        <div className="flex min-h-[44px] items-center gap-2 px-2 text-sm text-slate-600">
            <AlignLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">{chatPreferenceLabel(locale ?? lang, 'format')}</span>
            <ResponseFormatSelector compact value={format.value} onChange={format.onChange} disabled={format.disabled} />
        </div>
        {length && <div className="flex min-h-[44px] items-center gap-2 px-2 text-sm text-slate-600">
            <Rows3 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">{t('responseLength.shortLabel')}</span>
            <ResponseLengthSelector value={length.value} onChange={length.onChange} disabled={length.disabled} />
        </div>}
        {children}
        {reasoning && <div className="space-y-1 px-2 pb-1 text-sm text-slate-600">
            <div className="flex min-h-[44px] items-center gap-2">
                <Brain className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">{t('reasoning.shortLabel')}</span>
                <ReasoningSelector value={reasoning.value} onChange={reasoning.onChange} disabled={reasoning.disabled} mandatory={reasoning.mandatory} />
            </div>
            {reasoning.mandatory && <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">{t('reasoning.mandatory')}</p>}
        </div>}
    </div>;
}
