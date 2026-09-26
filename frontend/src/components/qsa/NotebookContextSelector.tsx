'use client';

// Selettore del taccuino nel contesto della chat guidata. Renderizzato solo
// per chi ha il ruolo docente (guard nel chiamante): docenti, ricercatori e
// admin passano canUseTeacherAssistant, ma la scelta riguarda chi ha un ruolo
// docente; per tutti gli altri il backend applica il default per strumento.

import { useI18n } from '@/lib/i18n-context';
import { Tooltip } from '@/components/ui/Tooltip';
import type { NotebookContextChoice } from '@/lib/notebook-context';

const OPTIONS: NotebookContextChoice[] = ['default', 'student', 'teacher', 'none'];

interface NotebookContextSelectorProps {
    value: NotebookContextChoice;
    onChange: (value: NotebookContextChoice) => void;
    disabled?: boolean;
}

export function NotebookContextSelector({ value, onChange, disabled = false }: NotebookContextSelectorProps) {
    const { t } = useI18n();

    return (
        <div
            role="radiogroup"
            aria-label={t('notebookContext.label')}
            className="inline-flex items-center rounded-md border border-slate-200 bg-white p-0.5"
        >
            {OPTIONS.map((option) => {
                const label = t(`notebookContext.${option}`);
                const tooltipLabel = `${t('notebookContext.label')}: ${label}`;
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
                            className={`flex h-7 items-center justify-center px-1.5 rounded text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                active
                                    ? 'bg-slate-700 text-white'
                                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                            }`}
                        >
                            {label}
                        </button>
                    </Tooltip>
                );
            })}
        </div>
    );
}
