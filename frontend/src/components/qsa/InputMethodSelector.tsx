'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { QuestionnaireConfig } from '@/lib/questionnaires';
import { useI18n } from '@/lib/i18n-context';
import { BackButton } from '@/components/ui/BackButton';
import { ForwardButton } from '@/components/ui/ForwardButton';
import { cn } from '@/lib/utils';

// Selezione del metodo di inserimento per il questionario.
// Stesso pattern del QuestionnaireSelector / CounselorSelector:
// si clicca la card per evidenziarla (badge check), poi si avanza con la
// freccia in alto e si torna indietro con la freccia. Nessun testo
// introduttivo: il FlowStepper in alto descrive già la fase.
type Method = 'manual' | 'upload';

interface InputMethodSelectorProps {
    onSelect: (method: Method) => void;
    onBack?: () => void;
    questionnaire?: QuestionnaireConfig;
}

interface Option {
    key: Method;
    title: string;
    desc: string;
    badge?: string;
}

export function InputMethodSelector({ onSelect, onBack, questionnaire }: InputMethodSelectorProps) {
    const { t } = useI18n();
    const supportsProfileUpload = questionnaire
        ? ['QSA', 'QSAr', 'QPCS', 'QPCC', 'QAP'].includes(questionnaire.id)
        : false;
    const manualDescription = questionnaire
        ? t('method.manual.descTpl', { name: questionnaire.name, codes: questionnaire.factors.map(f => f.code).join(', ') })
        : t('method.manual.descNoQ');
    const [selected, setSelected] = useState<Method | null>(null);

    const options: Option[] = [
        { key: 'manual', title: t('method.manual.title'), desc: manualDescription },
        ...(supportsProfileUpload ? [{
            key: 'upload' as Method,
            title: t('method.upload.title'),
            desc: t('method.upload.desc'),
            badge: t('method.upload.badge'),
        }] : []),
    ];

    const renderCard = (opt: Option) => {
        const isSelected = selected === opt.key;
        return (
            <button
                key={opt.key}
                type="button"
                onClick={() => setSelected(opt.key)}
                aria-pressed={isSelected}
                className={cn(
                    'relative flex flex-col items-start justify-center p-8 h-56 rounded-lg border text-left transition-colors',
                    isSelected
                        ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300'
                        : 'bg-white border-slate-200 hover:border-indigo-200'
                )}
            >
                {opt.badge && (
                    <div className="absolute top-4 left-4">
                        <span className="px-2 py-1 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                            {opt.badge}
                        </span>
                    </div>
                )}
                {isSelected && (
                    <div className="absolute right-3 top-3 rounded-full bg-indigo-600 p-1 text-white">
                        <Check className="h-3.5 w-3.5" />
                    </div>
                )}
                <h3 className="text-xl font-semibold mb-2 text-slate-900">{opt.title}</h3>
                <p className="text-sm text-slate-600">{opt.desc}</p>
            </button>
        );
    };

    return (
        <section className="space-y-5">
            <div className="flex items-center gap-3">
                {onBack && <BackButton onClick={onBack} label={t('nav.back')} />}
                <ForwardButton
                    onClick={() => { if (selected) onSelect(selected); }}
                    disabled={!selected}
                    label={t('counselor.continue')}
                />
            </div>
            <div className="grid md:grid-cols-2 gap-6 w-full max-w-4xl">
                {options.map(renderCard)}
            </div>
        </section>
    );
}