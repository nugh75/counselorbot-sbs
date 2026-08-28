'use client';

import { useI18n } from '@/lib/i18n-context';

export type ResponseLength = 'short' | 'medium' | 'long';

const OPTIONS: ResponseLength[] = ['short', 'medium', 'long'];

interface ResponseLengthSelectorProps {
    value: ResponseLength;
    onChange: (value: ResponseLength) => void;
    disabled?: boolean;
}

export function ResponseLengthSelector({ value, onChange, disabled = false }: ResponseLengthSelectorProps) {
    const { t } = useI18n();
    const index = Math.max(OPTIONS.indexOf(value), 0);

    return (
        <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="whitespace-nowrap">{t('responseLength.label')}</span>
            <input
                type="range"
                min={0}
                max={OPTIONS.length - 1}
                step={1}
                value={index}
                disabled={disabled}
                onChange={(e) => onChange(OPTIONS[Number(e.target.value)])}
                aria-label={t('responseLength.label')}
                aria-valuetext={t(`responseLength.${value}`)}
                className="h-1 w-20 cursor-pointer accent-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span className="w-12 whitespace-nowrap font-medium text-slate-700">{t(`responseLength.${value}`)}</span>
        </div>
    );
}
