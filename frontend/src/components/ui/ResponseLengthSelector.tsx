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

    return (
        <div
            role="radiogroup"
            aria-label={t('responseLength.label')}
            className="grid h-8 w-full max-w-60 grid-cols-3 overflow-hidden rounded-md border border-slate-200 bg-slate-50"
        >
            {OPTIONS.map((option) => {
                const selected = option === value;
                return (
                    <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={disabled}
                        onClick={() => onChange(option)}
                        className={`min-w-0 px-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            selected
                                ? 'bg-slate-800 text-white'
                                : 'bg-transparent text-slate-600 hover:bg-white hover:text-slate-900'
                        }`}
                    >
                        {t(`responseLength.${option}`)}
                    </button>
                );
            })}
        </div>
    );
}
