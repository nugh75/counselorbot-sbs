'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { QSA_FACTORS, QSAFactorCode } from '@/lib/qsa-model';
import { cn } from '@/lib/utils';
import { Info } from 'lucide-react';

const schema = z.object({
    scores: z.record(z.string(), z.coerce.number().min(1).max(9))
});

type FormData = z.infer<typeof schema>;

interface ScoreInputFormProps {
    onSubmit: (scores: Record<QSAFactorCode, number>) => void;
    initialScores?: Record<QSAFactorCode, number>;
}

export function ScoreInputForm({ onSubmit, initialScores }: ScoreInputFormProps) {
    const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
        defaultValues: { scores: initialScores || {} },
        // resolver: zodResolver(schema) // Simple validation enough for now
    });

    const cFactors = Object.values(QSA_FACTORS).filter(f => f.code.startsWith('C'));
    const aFactors = Object.values(QSA_FACTORS).filter(f => f.code.startsWith('A'));

    const onFormSubmit = (data: any) => {
        // Transform flat data if needed, but here simple record is fine
        onSubmit(data.scores);
    };

    const InputRow = ({ factor }: { factor: typeof cFactors[0] }) => (
        <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 transition-colors">
            <div className="flex-1">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-blue-400 font-bold">{factor.code}</span>
                    <span className="font-medium">{factor.name}</span>
                </div>
                <div className="text-xs text-muted-foreground ml-8 flex items-center gap-1">
                    {factor.description}
                </div>
            </div>
            <div className="flex items-center gap-2">
                <input
                    type="number"
                    min="1"
                    max="9"
                    {...register(`scores.${factor.code}` as any, { required: true, min: 1, max: 9 })}
                    className={cn(
                        "w-16 h-10 bg-black/40 border rounded-md text-center font-bold text-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all",
                        errors.scores?.[factor.code] ? "border-red-500" : "border-white/10"
                    )}
                />
            </div>
        </div>
    );

    return (
        <form onSubmit={handleSubmit(onFormSubmit)} className="w-full max-w-4xl mx-auto space-y-8 animate-fade-in-up">
            <div className="grid md:grid-cols-2 gap-8">

                {/* Cognitive Strategies Column */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-white/10">
                        <h3 className="text-xl font-semibold text-blue-200">Strategie Cognitive (C)</h3>
                    </div>
                    {cFactors.map(f => <InputRow key={f.code} factor={f} />)}
                </div>

                {/* Affective Strategies Column */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4 pb-2 border-b border-white/10">
                        <h3 className="text-xl font-semibold text-purple-200">Strategie Affettive (A)</h3>
                    </div>
                    {aFactors.map(f => <InputRow key={f.code} factor={f} />)}
                </div>

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
