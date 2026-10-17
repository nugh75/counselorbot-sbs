'use client';

import { factorTranslationKey } from '@/lib/questionnaires';

import { type FormEvent } from 'react';
import { Save } from 'lucide-react';
import { useForm, type UseFormRegister, type FieldErrors } from 'react-hook-form';
import { QuestionnaireConfig, FactorDefinition } from '@/lib/questionnaires';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n-context';
import { BackButton } from '@/components/ui/BackButton';
import { ForwardButton } from '@/components/ui/ForwardButton';
import { Button } from '@/components/ui/Button';
import { clearScoreDraft, loadScoreDraft, saveScoreDraft } from '@/lib/compilation-draft';

type FormData = { scores: Record<string, string | number> };

// Color per prefix (label tradotta via i18n: score.prefix.<X>)
const PREFIX_COLOR: Record<string, string> = {
    C: 'text-indigo-700',
    A: 'text-indigo-700',
    T: 'text-indigo-700',
    P: 'text-indigo-700',
    S: 'text-purple-700',
    K: 'text-cyan-700',
    AD: 'text-green-700',
};

// La riga sta fuori dal componente: definita dentro, veniva ricreata a ogni
// render e React la trattava come un tipo nuovo, smontando e rimontando tutti i
// campi. Il render arriva puntuale al submit fallito (il componente è iscritto a
// formState.errors), cioè proprio quando il fuoco serve dove manca il punteggio.
function InputRow({
    questionnaireId,
    factor,
    register,
    errors,
    t,
    tf,
}: {
    questionnaireId: string;
    factor: FactorDefinition;
    register: UseFormRegister<FormData>;
    errors: FieldErrors<FormData>;
    t: (key: string, vars?: Record<string, string | number>) => string;
    tf: (key: string, fallback: string) => string;
}) {
    // Il filtro lascia passare le cifre e i tasti di navigazione, ma deve cedere
    // le combinazioni: prima annullava anche Ctrl+V, e chi copia i punteggi dal
    // PDF non poteva incollarli. Enter, Home e Fine erano bloccati allo stesso modo.
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (
            !/^[1-9]$/.test(e.key) &&
            !['Backspace', 'Delete', 'Tab', 'Enter', 'Home', 'End', 'ArrowLeft', 'ArrowRight'].includes(e.key)
        ) {
            e.preventDefault();
        }
    };

    const handleInput = (e: React.FormEvent<HTMLInputElement>) => {
        const target = e.currentTarget;
        if (target.value.length > 1) {
            target.value = target.value.slice(0, 1);
        }
        if (target.value === '0') {
            target.value = '';
        }
    };

    const hasError = Boolean(errors.scores?.[factor.code]);
    const errorId = `score-error-${factor.code}`;

    return (
        // Label esplicita: prima il codice e il nome stavano in un div fratello,
        // invisibile all'associazione, e i venticinque campi si annunciavano tutti
        // come "campo di testo, vuoto". Avvolgere evita di generare id.
        <label className="flex items-center justify-between gap-3 p-2 rounded-md bg-white border border-slate-200 hover:border-indigo-200 transition-colors">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-indigo-600 font-bold text-sm">{factor.code}</span>
                    <span className="font-medium text-slate-700 text-sm">{tf(factorTranslationKey(questionnaireId, factor.code, 'name'), factor.name)}</span>
                </div>
                <div className="text-[11px] leading-tight text-slate-500 ml-8 flex items-center gap-1">
                    {tf(factorTranslationKey(questionnaireId, factor.code, 'desc'), factor.description)}
                </div>
                {hasError && (
                    <p id={errorId} className="ml-8 mt-1 text-[11px] font-medium text-red-700">
                        {t('score.error.required')}
                    </p>
                )}
            </div>
            <input
                type="text"
                inputMode="numeric"
                maxLength={1}
                aria-invalid={hasError}
                aria-describedby={hasError ? errorId : undefined}
                {...register(`scores.${factor.code}`, { required: true, min: 1, max: 9 })}
                onKeyDown={handleKeyDown}
                onInput={handleInput}
                className={cn(
                    "w-14 h-11 bg-white border rounded-md text-center font-bold text-base text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none transition-all",
                    hasError ? "border-red-600" : "border-slate-300"
                )}
            />
        </label>
    );
}

interface ScoreInputFormProps {
    questionnaire: QuestionnaireConfig;
    onSubmit: (scores: Record<string, number>) => void;
    initialScores?: Record<string, number>;
    onBack?: () => void;
    // I taccuini di prova non toccano la bozza della compilazione personale.
    persistDraft?: boolean;
    onDraftChange?: (scores: Record<string, number>) => void;
    submitLabel?: string;
    submitAction?: 'continue' | 'save';
    submitDisabled?: boolean;
    // Più form nella stessa pagina (taccuini di prova): id distinti.
    formId?: string;
    cancelLabel?: string;
}

export function ScoreInputForm({
    questionnaire,
    onSubmit,
    initialScores,
    onBack,
    persistDraft = true,
    onDraftChange,
    submitLabel,
    cancelLabel,
    submitAction = 'continue',
    submitDisabled = false,
    formId = 'score-form',
}: ScoreInputFormProps) {
    const { t, tf } = useI18n();
    // Venticinque numeri copiati da un PDF vivevano solo dentro react-hook-form:
    // si perdevano al ricaricamento e anche solo tornando indietro di un passo,
    // perché il componente si smonta. La bozza li tiene finché non sono inviati.
    const draft = persistDraft ? loadScoreDraft(questionnaire.id) : null;
    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        defaultValues: { scores: initialScores || draft?.scores || {} },
    });

    // I campi sono registrati come `scores.<codice>`: gli eventi di modifica
    // risalgono al form, quindi la bozza si legge da lì invece che dallo stato
    // interno della libreria.
    const rememberDraft = (event: FormEvent<HTMLFormElement>) => {
        if (!persistDraft && !onDraftChange) return;
        const scores: Record<string, number> = {};
        for (const [name, value] of new FormData(event.currentTarget).entries()) {
            if (!name.startsWith('scores.') || typeof value !== 'string' || value === '') continue;
            const parsed = Number(value);
            if (!Number.isNaN(parsed)) scores[name.slice('scores.'.length)] = parsed;
        }
        onDraftChange?.(scores);
        if (!persistDraft || Object.keys(scores).length === 0) return;
        saveScoreDraft({ instrument: questionnaire.id, scores, savedAt: new Date().toISOString() });
    };

    // Group factors by prefix
    const groupedFactors = questionnaire.factorPrefix.map(prefix => ({
        prefix,
        factors: questionnaire.factors.filter(f => f.code.startsWith(prefix)),
    }));

    const onFormSubmit = (data: FormData) => {
        const scores = Object.fromEntries(
            Object.entries(data.scores)
                .filter(([code]) => questionnaire.id !== "QPCC" || questionnaire.factors.some(factor => factor.code === code))
                .map(([code, value]) => [code, Number(value)]),
        );
        if (persistDraft) clearScoreDraft();
        onSubmit(scores);
    };

    const missingCount = Object.keys(errors.scores || {}).length;
    const gridCols = groupedFactors.length === 1 ? 'grid-cols-1 max-w-xl mx-auto' : 'md:grid-cols-2';

    // Stessa "prima riga" di selezione usata da QuestionnaireSelector /
    // CounselorSelector / InputMethodSelector: BackButton (cerchio quieto) +
    // ForwardButton nel percorso. Nel salvataggio del repertorio di prove
    // (submitAction="save"), i comandi Salva e Annulla formano una coppia
    // esplicita e uniforme, duplicata in testa e in coda per restare sempre
    // raggiungibile anche dopo lo scorrimento dei fattori.
    const actionButtons = (
        <div className="flex flex-wrap items-center gap-3">
            {submitAction === 'save' ? (
                <>
                    <Button type="submit" form={formId} disabled={submitDisabled} className="min-h-[44px]">
                        <Save className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {submitLabel || t('common.save')}
                    </Button>
                    {onBack && (
                        <Button type="button" variant="secondary" disabled={submitDisabled} onClick={onBack} className="min-h-[44px]">
                            {cancelLabel || t('common.cancel')}
                        </Button>
                    )}
                </>
            ) : (
                <>
                    {onBack && <BackButton onClick={onBack} label={t('nav.back')} />}
                    <ForwardButton type="submit" form={formId} disabled={submitDisabled} label={submitLabel || t('score.submit')} />
                </>
            )}
        </div>
    );

    return (
        <div className="w-full space-y-5 animate-fade-in-up">
            {actionButtons}
            {missingCount > 0 && (
                <p role="alert" className="max-w-4xl mx-auto rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                    {t('score.error.summary', { count: missingCount })}
                </p>
            )}
            <form id={formId} onChange={rememberDraft} onSubmit={handleSubmit(onFormSubmit)} className="max-w-4xl mx-auto space-y-4">
                <div className={cn("grid gap-x-8 gap-y-3", gridCols)}>
                    {groupedFactors.map(({ prefix, factors }) => {
                        const colorClass = PREFIX_COLOR[prefix] || 'text-slate-700';
                        const label = questionnaire.id === 'QPCC' ? t(`dimension.QPCC.${prefix}`) : PREFIX_COLOR[prefix] ? t(`score.prefix.${prefix}`) : `${prefix}`;
                        return (
                            <div key={prefix} className="space-y-1.5">
                                <div className="flex items-center gap-2 mb-2 pb-1 border-b border-slate-200">
                                    <h3 className={cn("text-lg font-bold", colorClass)}>{label}</h3>
                                </div>
                                {factors.map(f => (
                                    <InputRow key={f.code} questionnaireId={questionnaire.id} factor={f} register={register} errors={errors} t={t} tf={tf} />
                                ))}
                            </div>
                        );
                    })}
                </div>
                {submitAction === 'save' && (
                    <div className="pt-2">
                        {actionButtons}
                    </div>
                )}
            </form>
        </div>
    );
}
