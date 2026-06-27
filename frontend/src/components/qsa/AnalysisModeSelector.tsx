'use client';

import { BarChart, Layers, HelpCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';

interface AnalysisModeSelectorProps {
    onSelect: (mode: AnalysisMode) => void;
}

type AnalysisMode = 'factor' | 'second-level' | 'generic';

export function AnalysisModeSelector({ onSelect }: AnalysisModeSelectorProps) {
    const { t } = useI18n();
    const options: Array<{
        id: AnalysisMode;
        title: string;
        desc: string;
        icon: typeof BarChart;
        color: string;
        bg: string;
        border: string;
    }> = [
        {
            id: 'factor',
            title: t('mode.factor.title'),
            desc: t('mode.factor.desc'),
            icon: BarChart,
            color: 'text-indigo-600',
            bg: 'bg-indigo-50',
            border: 'border-indigo-100'
        },
        {
            id: 'second-level',
            title: t('mode.second-level.title'),
            desc: t('mode.second-level.desc'),
            icon: Layers,
            color: 'text-indigo-600',
            bg: 'bg-indigo-50',
            border: 'border-indigo-100'
        },
        {
            id: 'generic',
            title: t('mode.generic.title'),
            desc: t('mode.generic.desc'),
            icon: HelpCircle,
            color: 'text-indigo-600',
            bg: 'bg-indigo-50',
            border: 'border-indigo-100'
        }
    ];

    return (
        <div className="grid md:grid-cols-3 gap-6 w-full animate-fade-in-up">
            {options.map((opt) => (
                <button
                    key={opt.id}
                    onClick={() => onSelect(opt.id)}
                    className="flex flex-col items-center text-center p-6 rounded-lg bg-white border border-slate-200 shadow-sm hover:border-indigo-200 transition-colors"
                >
                    <div className={`w-12 h-12 rounded-md border flex items-center justify-center mb-4 ${opt.bg} ${opt.border}`}>
                        <opt.icon className={`w-6 h-6 ${opt.color}`} />
                    </div>
                    <h3 className="font-semibold text-lg text-slate-900 mb-2">{opt.title}</h3>
                    <p className="text-sm text-slate-500">{opt.desc}</p>
                </button>
            ))}
        </div>
    );
}
