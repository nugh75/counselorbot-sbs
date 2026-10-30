'use client';

import { useMemo } from 'react';
import { Plus, X } from 'lucide-react';
import { QUESTIONNAIRES, type QuestionnaireType } from '@/lib/questionnaires';
import { useI18n } from '@/lib/i18n-context';

/**
 * Selettore a fattori di «La mia lettura» (ResultReadingCard): una riga per
 * fattore o, per gli strumenti senza dimensioni (tipi evento, SAVICKAS), un
 * campo di testo libero. Il valore è la stringa «CODICE - Etichetta», la stessa
 * che la migrazione porta dal vecchio libretto.
 */
export function FactorMultiSelect({ label, value, onChange, questionnaireType }: {
    label: string;
    value: string[];
    onChange: (next: string[]) => void;
    questionnaireType: string;
}) {
    const { t, tf } = useI18n();
    const options = useMemo(() => {
        if (!(questionnaireType in QUESTIONNAIRES) || questionnaireType === 'SAVICKAS') return [];
        const config = QUESTIONNAIRES[questionnaireType as QuestionnaireType];
        return (config?.factors || []).map((factor) => {
            const factorLabel = tf(`factor.${factor.code}.name`, factor.name);
            return { value: `${factor.code} - ${factorLabel}`, label: `${factor.code} - ${factorLabel}` };
        });
    }, [questionnaireType, tf]);

    const setItem = (index: number, itemValue: string) => {
        const next = [...value];
        next[index] = itemValue;
        onChange(next);
    };

    const removeItem = (index: number) => {
        const next = value.filter((_, i) => i !== index);
        onChange(next.length > 0 ? next : ['']);
    };

    const inputClass = 'w-full rounded-control border border-line-strong px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-focus';

    const row = (item: string, index: number) => (
        <div key={index} className="flex items-center gap-2">
            {options.length > 0 ? (
                <select
                    value={item}
                    onChange={(event) => setItem(index, event.target.value)}
                    className={inputClass}
                >
                    <option value="">{t('booklet.factorChoose')}</option>
                    {options.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </select>
            ) : (
                <input
                    value={item}
                    onChange={(event) => setItem(index, event.target.value)}
                    className={inputClass}
                    placeholder={t('booklet.factorPlaceholder')}
                />
            )}
            <button
                type="button"
                onClick={() => removeItem(index)}
                className="inline-flex h-control w-control shrink-0 items-center justify-center rounded-control border border-line text-ink-muted hover:bg-surface-sunken hover:text-danger"
                aria-label={t('booklet.remove')}
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );

    return (
        <div className="block">
            <span className="text-xs font-semibold text-ink-muted">{label}</span>
            <div className="mt-1 space-y-2">
                {value.map((item, index) => row(item, index))}
            </div>
            <button
                type="button"
                onClick={() => onChange([...value, ''])}
                className="mt-2 inline-flex min-h-control items-center gap-1 text-xs font-semibold text-link hover:text-link"
            >
                <Plus className="h-3.5 w-3.5" /> {t('booklet.add')}
            </button>
        </div>
    );
}
