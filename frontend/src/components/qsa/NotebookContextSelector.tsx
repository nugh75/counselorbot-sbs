'use client';

// Selettore del taccuino nel contesto della chat guidata. Renderizzato solo
// per chi ha il ruolo docente (guard nel chiamante): docenti, ricercatori e
// admin passano canUseTeacherAssistant, ma la scelta riguarda chi ha un ruolo
// docente; per tutti gli altri il backend applica il default per strumento.
// "Prova" usa un taccuino studente di prova (PracticeNotebookPicker).

import { useI18n } from '@/lib/i18n-context';
import { Tooltip } from '@/components/ui/Tooltip';
import { ListRadioMark, listRadioClass, listRadioGroupClass } from '@/components/ui/ChatOptionsMenu';
import type { NotebookContextChoice } from '@/lib/notebook-context';

const OPTIONS: NotebookContextChoice[] = ['default', 'student', 'teacher', 'practice', 'none'];

interface NotebookContextSelectorProps {
    value: NotebookContextChoice;
    onChange: (value: NotebookContextChoice) => void;
    disabled?: boolean;
    // La Bussola offre solo Predefinito e Prova.
    options?: NotebookContextChoice[];
    // Elenco verticale, per il sottolivello del menù «⋮».
    list?: boolean;
}

export function NotebookContextSelector({ value, onChange, disabled = false, options = OPTIONS, list = false }: NotebookContextSelectorProps) {
    const { t } = useI18n();

    return (
        <div
            role="radiogroup"
            aria-label={t('notebookContext.label')}
            className={list ? listRadioGroupClass : 'inline-flex flex-wrap items-center rounded-control border border-line bg-surface p-1'}
        >
            {options.map((option) => {
                const label = t(`notebookContext.${option}`);
                const tooltipLabel = `${t('notebookContext.label')}: ${label}`;
                const active = option === value;
                if (list) return (
                    <button key={option} type="button" role="radio" aria-checked={active} aria-label={tooltipLabel} disabled={disabled} onClick={() => onChange(option)} className={listRadioClass(active)}>
                        <ListRadioMark active={active} />{label}
                    </button>
                );
                return (
                    <Tooltip key={option} content={tooltipLabel} side="top">
                        <button
                            type="button"
                            role="radio"
                            aria-checked={active}
                            aria-label={tooltipLabel}
                            disabled={disabled}
                            onClick={() => onChange(option)}
                            className={`flex min-h-control items-center justify-center px-2 rounded-control text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                active
                                    ? 'bg-ink-body text-surface'
                                    : 'text-ink-muted hover:bg-surface-raised hover:text-ink-body'
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
