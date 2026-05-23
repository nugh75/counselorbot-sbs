'use client';

import { BarChart, Layers, HelpCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';

interface AnalysisModeSelectorProps {
    onSelect: (mode: 'factor' | 'second-level' | 'generic') => void;
}

export function AnalysisModeSelector({ onSelect }: AnalysisModeSelectorProps) {
    const { t } = useI18n();
    const options = [
        {
            id: 'factor',
            title: t('mode.factor.title'),
            desc: t('mode.factor.desc'),
            icon: BarChart,
            color: 'text-blue-400',
            bg: 'bg-blue-500/10',
            border: 'border-blue-500/20'
        },
        {
            id: 'second-level',
            title: t('mode.second-level.title'),
            desc: t('mode.second-level.desc'),
            icon: Layers,
            color: 'text-purple-400',
            bg: 'bg-purple-500/10',
            border: 'border-purple-500/20'
        },
        {
            id: 'generic',
            title: t('mode.generic.title'),
            desc: t('mode.generic.desc'),
            icon: HelpCircle,
            color: 'text-green-400',
            bg: 'bg-green-500/10',
            border: 'border-green-500/20'
        }
    ];

    return (
        <div className="grid md:grid-cols-3 gap-6 w-full animate-fade-in-up">
            {options.map((opt) => (
                <button
                    key={opt.id}
                    onClick={() => onSelect(opt.id as any)}
                    className="flex flex-col items-center text-center p-6 rounded-2xl glass-card border-white/5 hover:border-white/20 transition-all hover:-translate-y-1"
                >
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${opt.bg} ${opt.border}`}>
                        <opt.icon className={`w-6 h-6 ${opt.color}`} />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">{opt.title}</h3>
                    <p className="text-sm text-muted-foreground">{opt.desc}</p>
                </button>
            ))}
        </div>
    );
}
