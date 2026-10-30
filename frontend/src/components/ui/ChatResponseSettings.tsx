'use client';

import type { ReactNode } from 'react';
import { AlignLeft, Brain, Rows3 } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { chatPreferenceLabel, type ResponseFormat } from '@/lib/chat-preferences';
import { chatLayoutLabel } from '@/lib/i18n-chat-layout';
import type { Lang } from '@/lib/i18n';
import { ChatMenuSection, ChatMenuSetting } from '@/components/ui/ChatOptionsMenu';
import { ResponseFormatSelector } from '@/components/ui/ResponseFormatSelector';
import { ResponseLengthSelector, type ResponseLength } from '@/components/ui/ResponseLengthSelector';
import { ReasoningSelector, type ReasoningEffort } from '@/components/ui/ReasoningSelector';

// Sezione «Risposte» del menù «⋮» (#657, #682): stesso ordine, icone ed
// etichette in chat guidata, Bussola e Assistente; ogni riga mostra il valore
// corrente e apre il selettore in un sottolivello. Ogni chat passa solo le
// impostazioni che il suo backend accetta.
export function ChatResponseSettings({ format, length, reasoning, locale, children }: {
    format: { value: ResponseFormat; onChange: (value: ResponseFormat) => void; disabled?: boolean };
    length?: { value: ResponseLength; onChange: (value: ResponseLength) => void; disabled?: boolean };
    reasoning?: { value: ReasoningEffort; onChange: (value: ReasoningEffort) => void; disabled?: boolean; mandatory?: boolean };
    // Lingua della sessione guidata, se diversa da quella dell'interfaccia.
    locale?: Lang;
    // Righe extra (es. taccuino del docente) dopo il ragionamento.
    children?: ReactNode;
}) {
    const { t, lang } = useI18n();
    const formatLang = locale ?? lang;
    return <div data-testid="chat-response-settings">
        <ChatMenuSection title={chatLayoutLabel(lang, 'menuResponses')}>
            <ChatMenuSetting icon={<AlignLeft className="h-4 w-4 shrink-0" aria-hidden="true" />}
                label={chatPreferenceLabel(formatLang, 'format')} value={chatPreferenceLabel(formatLang, format.value)} title={chatPreferenceLabel(formatLang, 'format')}>
                <ResponseFormatSelector list value={format.value} onChange={format.onChange} disabled={format.disabled} />
            </ChatMenuSetting>
            {length && <ChatMenuSetting icon={<Rows3 className="h-4 w-4 shrink-0" aria-hidden="true" />}
                label={t('responseLength.shortLabel')} value={t(`responseLength.${length.value}`)} title={t('responseLength.label')}>
                <ResponseLengthSelector list value={length.value} onChange={length.onChange} disabled={length.disabled} />
            </ChatMenuSetting>}
            {reasoning && <ChatMenuSetting icon={<Brain className="h-4 w-4 shrink-0" aria-hidden="true" />}
                label={t('reasoning.shortLabel')} value={t(`reasoning.${reasoning.value}`)} title={t('reasoning.label')}>
                <ReasoningSelector list value={reasoning.value} onChange={reasoning.onChange} disabled={reasoning.disabled} mandatory={reasoning.mandatory} />
                {reasoning.mandatory && <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">{t('reasoning.mandatory')}</p>}
            </ChatMenuSetting>}
            {children}
        </ChatMenuSection>
    </div>;
}
