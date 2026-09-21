'use client';

import { useI18n } from '@/lib/i18n-context';
import { chatPreferenceLabel, type ResponseFormat } from '@/lib/chat-preferences';

export function ResponseFormatSelector({ value, onChange, disabled = false }: {
    value: ResponseFormat;
    onChange: (value: ResponseFormat) => void;
    disabled?: boolean;
}) {
    const { lang } = useI18n();
    return <label className="flex min-h-11 flex-wrap items-center gap-2 px-2 text-sm text-slate-600">
        <span>{chatPreferenceLabel(lang, 'format')}</span>
        <select aria-label={chatPreferenceLabel(lang, 'format')} value={value} disabled={disabled}
            onChange={event => onChange(event.target.value as ResponseFormat)}
            className="min-h-11 max-w-full rounded-md border border-slate-300 bg-white px-2 text-slate-800 disabled:opacity-50">
            {(['standard', 'bullets', 'table'] as const).map(option => <option key={option} value={option}>{chatPreferenceLabel(lang, option)}</option>)}
        </select>
    </label>;
}
