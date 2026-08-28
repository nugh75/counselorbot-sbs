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
            className="inline-flex items-center rounded-md border border-slate-200 bg-white p-0.5"
        >
            {OPTIONS.map((option, index) => {
                const optionLabel = t(`responseLength.${option}`);
                const active = option === value;
                return (
                    <button
                        key={option}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={`${t('responseLength.label')}: ${optionLabel}`}
                        title={optionLabel}
                        disabled={disabled}
                        onClick={() => onChange(option)}
                        className={`flex h-7 w-7 flex-col items-center justify-center gap-0.5 rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            active
                                ? 'bg-slate-700 text-white'
                                : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                        }`}
                    >
                        {[0, 1, 2].map((line) => (
                            <span
                                key={line}
                                aria-hidden="true"
                                className="block h-px rounded-full bg-current"
                                style={{ width: `${8 + index * 3 - line}px` }}
                            />
                        ))}
                    </button>
                );
            })}
        </div>
    );
}
