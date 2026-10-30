'use client';

import { Brain, BrainCircuit, Zap } from 'lucide-react';

import { useI18n } from '@/lib/i18n-context';
import { Tooltip } from '@/components/ui/Tooltip';
import { ListRadioMark, listRadioClass, listRadioGroupClass } from '@/components/ui/ChatOptionsMenu';

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
    // Il modello ragiona sempre: «Nessuno» resta visibile ma non selezionabile.
    mandatory?: boolean;
    // Elenco verticale con etichette, per il sottolivello del menù «⋮».
    list?: boolean;
}

export function ReasoningSelector({ value, onChange, disabled = false, mandatory = false, list = false }: ReasoningSelectorProps) {
    const { t } = useI18n();

    return (
        <div
            role="radiogroup"
            aria-label={t('reasoning.label')}
            className={list ? listRadioGroupClass : 'inline-flex items-center rounded-md border border-slate-200 bg-white p-0.5'}
        >
            {OPTIONS.map(({ value: option, Icon }) => {
                const optionLabel = t(`reasoning.${option}`);
                const optionDisabled = disabled || (mandatory && option === 'off');
                const tooltipLabel = mandatory && option === 'off'
                    ? t('reasoning.mandatoryOption')
                    : `${t('reasoning.label')}: ${optionLabel}`;
                const active = option === value;
                if (list) return (
                    <button key={option} type="button" role="radio" aria-checked={active} aria-label={tooltipLabel} aria-disabled={optionDisabled} disabled={optionDisabled} onClick={() => onChange(option)} className={listRadioClass(active)}>
                        <ListRadioMark active={active} /><Icon className="h-4 w-4 shrink-0" aria-hidden="true" />{optionLabel}
                    </button>
                );
                return (
                    <Tooltip key={option} content={tooltipLabel} side="top">
                        <button
                            type="button"
                            role="radio"
                            aria-checked={active}
                            aria-label={tooltipLabel}
                            aria-disabled={optionDisabled}
                            disabled={optionDisabled}
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
