'use client';

import { useForm, type UseFormRegister, type FieldErrors } from 'react-hook-form';
import { QuestionnaireConfig, FactorDefinition } from '@/lib/questionnaires';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n-context';
import { BackButton } from '@/components/ui/BackButton';
import { ForwardButton } from '@/components/ui/ForwardButton';

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
    factor,
    register,
    errors,
    t,
    tf,
}: {
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
                    <span className="font-medium text-slate-700 text-sm">{tf(`factor.${factor.code}.name`, factor.name)}</span>
                </div>
                <div className="text-[11px] leading-tight text-slate-500 ml-8 flex items-center gap-1">
                    {tf(`factor.${factor.code}.desc`, factor.description)}
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
}

export function ScoreInputForm({ questionnaire, onSubmit, initialScores, onBack }: ScoreInputFormProps) {
    const { t, tf } = useI18n();
    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        defaultValues: { scores: initialScores || {} },
    });

    // Group factors by prefix
    const groupedFactors = questionnaire.factorPrefix.map(prefix => ({
        prefix,
        factors: questionnaire.factors.filter(f => f.code.startsWith(prefix)),
    }));

    const onFormSubmit = (data: FormData) => {
        const scores = Object.fromEntries(
            Object.entries(data.scores).map(([code, value]) => [code, Number(value)]),
        );
        onSubmit(scores);
    };

    const missingCount = Object.keys(errors.scores || {}).length;
    const gridCols = groupedFactors.length === 1 ? 'grid-cols-1 max-w-xl mx-auto' : 'md:grid-cols-2';

    // Stessa "prima riga" di selezione usata da QuestionnaireSelector /
    // CounselorSelector / InputMethodSelector: BackButton (cerchio quieto) +
    // ForwardButton (primario con etichetta, qui submit del form). Nessun testo
    // introduttivo: il FlowStepper in alto descrive già la fase.
    // Il fuoco sul primo campo mancante lo porta shouldFocusError di
    // react-hook-form, attivo di default: il submit sta in cima e i campi
    // scorrono per venticinque righe.
    return (
        <div className="w-full space-y-5 animate-fade-in-up">
            <div className="flex items-center gap-3">
                {onBack && <BackButton onClick={onBack} label={t('nav.back')} />}
                <ForwardButton type="submit" form="score-form" label={t('score.submit')} />
            </div>
            {missingCount > 0 && (
                <p role="alert" className="max-w-4xl mx-auto rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                    {t('score.error.summary', { count: missingCount })}
                </p>
            )}
            <form id="score-form" onSubmit={handleSubmit(onFormSubmit)} className="max-w-4xl mx-auto space-y-4">
                <div className={cn("grid gap-x-8 gap-y-3", gridCols)}>
                    {groupedFactors.map(({ prefix, factors }) => {
                        const colorClass = PREFIX_COLOR[prefix] || 'text-slate-700';
                        const label = PREFIX_COLOR[prefix] ? t(`score.prefix.${prefix}`) : `${prefix}`;
                        return (
                            <div key={prefix} className="space-y-1.5">
                                <div className="flex items-center gap-2 mb-2 pb-1 border-b border-slate-200">
                                    <h3 className={cn("text-lg font-bold", colorClass)}>{label}</h3>
                                </div>
                                {factors.map(f => (
                                    <InputRow key={f.code} factor={f} register={register} errors={errors} t={t} tf={tf} />
                                ))}
                            </div>
                        );
                    })}
                </div>
            </form>
        </div>
    );
}
