'use client';

import { useI18n } from '@/lib/i18n-context';
import { chatPreferenceLabel, type ResponseFormat } from '@/lib/chat-preferences';
import { AlignLeft, List } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';

// Solo discorsivo e puntato: la variante tabella non era rispettata in modo
// affidabile dal modello e allungava il selettore senza beneficio.
const COMPACT_OPTIONS = [
    { value: 'standard', Icon: AlignLeft },
    { value: 'bullets', Icon: List },
] as const;

export function ResponseFormatSelector({ value, onChange, disabled = false, compact = false }: {
    value: ResponseFormat;
    onChange: (value: ResponseFormat) => void;
    disabled?: boolean;
    compact?: boolean;
}) {
    const { lang } = useI18n();
    if (compact) return <div role="radiogroup" aria-label={chatPreferenceLabel(lang, 'format')} className="inline-flex items-center rounded-md border border-slate-200 bg-white p-0.5">
        {COMPACT_OPTIONS.map(({ value: option, Icon }) => {
            const label = `${chatPreferenceLabel(lang, 'format')}: ${chatPreferenceLabel(lang, option)}`;
            const active = option === value;
            return <Tooltip key={option} content={label} side="top"><button type="button" role="radio" aria-checked={active} aria-label={label} disabled={disabled} onClick={() => onChange(option)}
                className={`flex h-7 w-7 items-center justify-center rounded transition-colors disabled:opacity-50 ${active ? 'bg-slate-700 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </button></Tooltip>;
        })}
    </div>;
    return <label className="flex min-h-11 flex-wrap items-center gap-2 px-2 text-sm text-slate-600">
        <span>{chatPreferenceLabel(lang, 'format')}</span>
        <select aria-label={chatPreferenceLabel(lang, 'format')} value={value} disabled={disabled}
            onChange={event => onChange(event.target.value as ResponseFormat)}
            className="min-h-11 max-w-full rounded-md border border-slate-300 bg-white px-2 text-slate-800 disabled:opacity-50">
            {(['standard', 'bullets'] as const).map(option => <option key={option} value={option}>{chatPreferenceLabel(lang, option)}</option>)}
        </select>
    </label>;
}
