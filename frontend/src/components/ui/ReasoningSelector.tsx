'use client';

import { Brain, BrainCircuit, Zap } from 'lucide-react';

import { useI18n } from '@/lib/i18n-context';
import { Tooltip } from '@/components/ui/Tooltip';

export type ReasoningEffort = 'off' | 'standard' | 'deep';

const OPTIONS: { value: ReasoningEffort; Icon: typeof Brain }[] = [
    { value: 'off', Icon: Zap },
    { value: 'standard', Icon: Brain },
    { value: 'deep', Icon: BrainCircuit },
];

interface ReasoningSelectorProps {
    value: ReasoningEffort;
    onChange: (value: ReasoningEffort) => void;
    disabled?: boolean;
}

export function ReasoningSelector({ value, onChange, disabled = false }: ReasoningSelectorProps) {
    const { t } = useI18n();

    return (
        <div
            role="radiogroup"
            aria-label={t('reasoning.label')}
            className="inline-flex items-center rounded-md border border-slate-200 bg-white p-0.5"
        >
            {OPTIONS.map(({ value: option, Icon }) => {
                const optionLabel = t(`reasoning.${option}`);
                const tooltipLabel = `${t('reasoning.label')}: ${optionLabel}`;
                const active = option === value;
                return (
                    <Tooltip key={option} content={tooltipLabel} side="top">
                        <button
                            type="button"
                            role="radio"
                            aria-checked={active}
                            aria-label={tooltipLabel}
                            disabled={disabled}
                            onClick={() => onChange(option)}
                            className={`flex h-7 w-7 items-center justify-center rounded transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                active
                                    ? 'bg-slate-700 text-white'
                                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                            }`}
                        >
                            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                    </Tooltip>
                );
            })}
        </div>
    );
}
