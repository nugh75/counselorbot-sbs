'use client';

import { useI18n } from '@/lib/i18n-context';
import { chatPreferenceLabel, type ResponseFormat } from '@/lib/chat-preferences';
import { AlignLeft, List } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { Select } from '@/components/ui/Field';
import { ListRadioMark, listRadioClass, listRadioGroupClass } from '@/components/ui/ChatOptionsMenu';

// Solo discorsivo e puntato: la variante tabella non era rispettata in modo
// affidabile dal modello e allungava il selettore senza beneficio.
const COMPACT_OPTIONS = [
    { value: 'standard', Icon: AlignLeft },
    { value: 'bullets', Icon: List },
] as const;

export function ResponseFormatSelector({ value, onChange, disabled = false, compact = false, list = false }: {
    value: ResponseFormat;
    onChange: (value: ResponseFormat) => void;
    disabled?: boolean;
    compact?: boolean;
    // Elenco verticale con etichette, per il sottolivello del menù «⋮».
    list?: boolean;
}) {
    const { lang } = useI18n();
    if (compact || list) return <div role="radiogroup" aria-label={chatPreferenceLabel(lang, 'format')} className={list ? listRadioGroupClass : 'inline-flex items-center rounded-control border border-line bg-surface p-0.5'}>
        {COMPACT_OPTIONS.map(({ value: option, Icon }) => {
            const label = `${chatPreferenceLabel(lang, 'format')}: ${chatPreferenceLabel(lang, option)}`;
            const active = option === value;
            if (list) return <button key={option} type="button" role="radio" aria-checked={active} aria-label={label} disabled={disabled} onClick={() => onChange(option)} className={listRadioClass(active)}>
                <ListRadioMark active={active} /><Icon className="h-4 w-4 shrink-0" aria-hidden="true" />{chatPreferenceLabel(lang, option)}
            </button>;
            return <Tooltip key={option} content={label} side="top"><button type="button" role="radio" aria-checked={active} aria-label={label} disabled={disabled} onClick={() => onChange(option)}
                className={`flex h-7 w-7 items-center justify-center rounded-control transition-colors disabled:opacity-50 ${active ? 'bg-brand text-ink-on-brand' : 'text-ink-muted hover:bg-surface-raised hover:text-ink-body'}`}>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            </button></Tooltip>;
        })}
    </div>;
    return <label className="flex min-h-control flex-wrap items-center gap-2 px-2 text-sm text-ink-body">
        <span>{chatPreferenceLabel(lang, 'format')}</span>
        <Select aria-label={chatPreferenceLabel(lang, 'format')} value={value} disabled={disabled}
            onChange={event => onChange(event.target.value as ResponseFormat)}
            className="w-auto max-w-full disabled:opacity-50">
            {(['standard', 'bullets'] as const).map(option => <option key={option} value={option}>{chatPreferenceLabel(lang, option)}</option>)}
        </Select>
    </label>;
}
