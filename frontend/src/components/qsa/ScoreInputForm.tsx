'use client';

import { useForm } from 'react-hook-form';
import { QuestionnaireConfig, FactorDefinition } from '@/lib/questionnaires';
import { cn } from '@/lib/utils';

const schema_placeholder = null; // validation handled inline

type FormData = { scores: Record<string, string | number> };

// Column header labels per prefix
const PREFIX_LABEL: Record<string, { label: string; colorClass: string }> = {
    C: { label: 'Strategie Cognitive (C)', colorClass: 'text-blue-700' },
    A: { label: 'Strategie Affettive (A)', colorClass: 'text-purple-700' },
    T: { label: 'Prospettiva Temporale (T)', colorClass: 'text-amber-700' },
};

interface ScoreInputFormProps {
    questionnaire: QuestionnaireConfig;
    onSubmit: (scores: Record<string, number>) => void;
    initialScores?: Record<string, number>;
}

export function ScoreInputForm({ questionnaire, onSubmit, initialScores }: ScoreInputFormProps) {
    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        defaultValues: { scores: initialScores || {} },
    });

    // Group factors by prefix
    const groupedFactors = questionnaire.factorPrefix.map(prefix => ({
        prefix,
        factors: questionnaire.factors.filter(f => f.code.startsWith(prefix)),
    }));

    const onFormSubmit = (data: any) => {
        onSubmit(data.scores);
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
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200 hover:border-blue-300 transition-colors">
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-blue-600 font-bold">{factor.code}</span>
                        <span className="font-medium text-slate-700">{factor.name}</span>
                    </div>
                    <div className="text-xs text-slate-500 ml-8 flex items-center gap-1">
                        {factor.description}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        {...register(`scores.${factor.code}` as any, { required: true, min: 1, max: 9 })}
                        onKeyDown={handleKeyDown}
                        onInput={handleInput}
                        className={cn(
                            "w-16 h-10 bg-white border rounded-md text-center font-bold text-lg text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all",
                            errors.scores?.[factor.code] ? "border-red-500" : "border-slate-300"
                        )}
                    />
                </div>
            </div>
        );
    };

    const gridCols = groupedFactors.length === 1 ? 'grid-cols-1 max-w-xl mx-auto' : 'md:grid-cols-2';

    return (
        <form onSubmit={handleSubmit(onFormSubmit)} className="w-full max-w-4xl mx-auto space-y-8 animate-fade-in-up">
            <div className={cn("grid gap-8", gridCols)}>
                {groupedFactors.map(({ prefix, factors }) => {
                    const colStyle = PREFIX_LABEL[prefix] || { label: `Fattori ${prefix}`, colorClass: 'text-slate-700' };
                    return (
                        <div key={prefix} className="space-y-4">
                            <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-200">
                                <h3 className={cn("text-xl font-bold", colStyle.colorClass)}>{colStyle.label}</h3>
                            </div>
                            {factors.map(f => <InputRow key={f.code} factor={f} />)}
                        </div>
                    );
                })}
            </div>

            <div className="flex justify-end pt-6">
                <button
                    type="submit"
                    className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg shadow-blue-500/20 transition-all hover:scale-105 active:scale-95"
                >
                    Analizza Profilo
                </button>
            </div>
        </form>
    );
}
