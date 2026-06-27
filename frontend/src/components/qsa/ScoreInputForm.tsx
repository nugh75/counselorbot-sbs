'use client';

import { useForm } from 'react-hook-form';
import { QuestionnaireConfig, FactorDefinition } from '@/lib/questionnaires';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n-context';

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

interface ScoreInputFormProps {
    questionnaire: QuestionnaireConfig;
    onSubmit: (scores: Record<string, number>) => void;
    initialScores?: Record<string, number>;
}

export function ScoreInputForm({ questionnaire, onSubmit, initialScores }: ScoreInputFormProps) {
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

    const InputRow = ({ factor }: { factor: FactorDefinition }) => {
        const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (
                !/^[1-9]$/.test(e.key) &&
                !['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight'].includes(e.key)
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

        return (
            <div className="flex items-center justify-between p-2 rounded-md bg-white border border-slate-200 hover:border-indigo-200 transition-colors">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-indigo-600 font-bold text-sm">{factor.code}</span>
                        <span className="font-medium text-slate-700 text-sm">{tf(`factor.${factor.code}.name`, factor.name)}</span>
                    </div>
                    <div className="text-[11px] leading-tight text-slate-500 ml-8 flex items-center gap-1">
                        {tf(`factor.${factor.code}.desc`, factor.description)}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        {...register(`scores.${factor.code}`, { required: true, min: 1, max: 9 })}
                        onKeyDown={handleKeyDown}
                        onInput={handleInput}
                        className={cn(
                            "w-14 h-9 bg-white border rounded-md text-center font-bold text-base text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none transition-all",
                            errors.scores?.[factor.code] ? "border-red-500" : "border-slate-300"
                        )}
                    />
                </div>
            </div>
        );
    };

    const gridCols = groupedFactors.length === 1 ? 'grid-cols-1 max-w-xl mx-auto' : 'md:grid-cols-2';

    return (
        <form onSubmit={handleSubmit(onFormSubmit)} className="w-full max-w-4xl mx-auto space-y-4 animate-fade-in-up">
            <div className={cn("grid gap-x-8 gap-y-3", gridCols)}>
                {groupedFactors.map(({ prefix, factors }) => {
                    const colorClass = PREFIX_COLOR[prefix] || 'text-slate-700';
                    const label = PREFIX_COLOR[prefix] ? t(`score.prefix.${prefix}`) : `${prefix}`;
                    return (
                        <div key={prefix} className="space-y-1.5">
                            <div className="flex items-center gap-2 mb-2 pb-1 border-b border-slate-200">
                                <h3 className={cn("text-lg font-bold", colorClass)}>{label}</h3>
                            </div>
                            {factors.map(f => <InputRow key={f.code} factor={f} />)}
                        </div>
                    );
                })}
            </div>

            <div className="flex justify-end pt-2">
                <button
                    type="submit"
                    className="px-8 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md transition-colors"
                >
                    {t('score.submit')}
                </button>
            </div>
        </form>
    );
}
