'use client';

import { BarChart, Layers, HelpCircle } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { EntryLink } from '@/components/ui/EntryList';

interface AnalysisModeSelectorProps {
    onSelect: (mode: AnalysisMode) => void;
}

type AnalysisMode = 'factor' | 'second-level' | 'generic';

export function AnalysisModeSelector({ onSelect }: AnalysisModeSelectorProps) {
    const { t } = useI18n();
    const options: Array<{ id: AnalysisMode; icon: typeof BarChart }> = [
        { id: 'factor', icon: BarChart },
        { id: 'second-level', icon: Layers },
        { id: 'generic', icon: HelpCircle },
    ];

    return (
        <div className="grid w-full grid-cols-1 gap-x-6 gap-y-1 animate-fade-in-up md:grid-cols-2">
            {options.map((opt) => (
                <EntryLink
                    key={opt.id}
                    idPrefix="analysis-mode"
                    id={opt.id}
                    href=""
                    onOpen={() => onSelect(opt.id)}
                    illustration={<opt.icon className="h-8 w-8 shrink-0 text-brand" aria-hidden />}
                    name={t(`mode.${opt.id}.title`)}
                    description={t(`mode.${opt.id}.desc`)}
                />
            ))}
        </div>
    );
}
