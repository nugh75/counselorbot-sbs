'use client';

import { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { QuestionnaireConfig } from '@/lib/questionnaires';
import { useI18n } from '@/lib/i18n-context';
import { BackButton } from '@/components/ui/BackButton';
import { ForwardButton } from '@/components/ui/ForwardButton';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/auth';

// Selezione del metodo di inserimento per il questionario.
// Stesso pattern del QuestionnaireSelector / CounselorSelector:
// si clicca la card per evidenziarla (badge check), poi si avanza con la
// freccia in alto e si torna indietro con la freccia. Nessun testo
// introduttivo: il FlowStepper in alto descrive già la fase.
type Method = 'manual' | 'upload' | 'resume';

interface SavedResult {
    id: number;
    session_id: string;
    questionnaire_type: string;
    scores: Record<string, number> | null;
    submitted_at: string;
}

interface InputMethodSelectorProps {
    onSelect: (method: Method, resumeData?: { sessionId: string; scores: Record<string, number> }) => void;
    onBack?: () => void;
    questionnaire?: QuestionnaireConfig;
    hasPreviousData?: boolean;
}

interface Option {
    key: Method;
    title: string;
    desc: string;
    badge?: string;
}

export function InputMethodSelector({ onSelect, onBack, questionnaire, hasPreviousData = false }: InputMethodSelectorProps) {
    const { t } = useI18n();
    const supportsProfileUpload = questionnaire
        ? ['QSA', 'QSAr', 'QPCS', 'QPCC', 'QAP'].includes(questionnaire.id)
        : false;
    const manualDescription = questionnaire
        ? t('method.manual.descTpl', { name: questionnaire.name, codes: questionnaire.factors.map(f => f.code).join(', ') })
        : t('method.manual.descNoQ');
    const [selected, setSelected] = useState<Method | null>(null);
    const [savedResults, setSavedResults] = useState<SavedResult[]>([]);
    const [chosenResultId, setChosenResultId] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        if (!questionnaire || !hasPreviousData) {
            queueMicrotask(() => { if (!cancelled) setSavedResults([]); });
            return () => { cancelled = true; };
        }
        apiFetch('/api/user/questionnaire-results')
            .then((res) => res.ok ? res.json() : [])
            .then((all: SavedResult[]) => {
                if (cancelled) return;
                const filtered = all
                    .filter((r) => r.questionnaire_type === questionnaire.id && r.scores && Object.keys(r.scores).length > 0)
                    .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
                setSavedResults(filtered);
            })
            .catch(() => { if (!cancelled) setSavedResults([]); });
        return () => { cancelled = true; };
    }, [questionnaire, hasPreviousData]);

    const options: Option[] = [
        { key: 'manual', title: t('method.manual.title'), desc: manualDescription },
        ...(supportsProfileUpload ? [{
            key: 'upload' as Method,
            title: t('method.upload.title'),
            desc: t('method.upload.desc'),
            badge: t('method.upload.badge'),
        }] : []),
        ...(hasPreviousData ? [{
            key: 'resume' as Method,
            title: t('method.resume.title'),
            desc: t('method.resume.desc'),
            badge: t('method.resume.badge'),
        }] : []),
    ];

    const renderCard = (opt: Option) => {
        const isSelected = selected === opt.key;
        const cardClass = cn(
            'relative flex flex-col items-start justify-center p-8 h-56 rounded-lg border text-left transition-colors w-full',
            isSelected
                ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300'
                : 'bg-white border-slate-200 hover:border-indigo-200 cursor-pointer'
        );
        const badge = opt.badge && (
            <div className="absolute top-4 left-4">
                <span className="px-2 py-1 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100">
                    {opt.badge}
                </span>
            </div>
        );
        const check = isSelected && (
            <div className="absolute right-3 top-3 rounded-full bg-indigo-600 p-1 text-white">
                <Check className="h-3.5 w-3.5" />
            </div>
        );
        const body = (
            <>
                <h3 className="text-xl font-semibold mb-2 text-slate-900">{opt.title}</h3>
                <p className="text-sm text-slate-600">{opt.desc}</p>
            </>
        );

        // La card "resume" contiene un <select>, non può essere un <button>.
        if (opt.key === 'resume') {
            return (
                <div
                    key={opt.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(opt.key)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(opt.key); } }}
                    aria-pressed={isSelected}
                    className={cardClass}
                >
                    {badge}
                    {check}
                    {body}
                    {isSelected && savedResults.length > 0 && (
                        <div className="absolute inset-x-4 bottom-4" onClick={(e) => e.stopPropagation()}>
                            <select
                                value={chosenResultId ?? ''}
                                onChange={(e) => setChosenResultId(e.target.value ? Number(e.target.value) : null)}
                                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            >
                                <option value="">{t('method.resume.placeholder')}</option>
                                {savedResults.map((r) => (
                                    <option key={r.id} value={r.id}>
                                        {new Date(r.submitted_at).toLocaleString()} · {r.session_id.slice(0, 8)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            );
        }

        return (
            <button
                key={opt.key}
                type="button"
                onClick={() => setSelected(opt.key)}
                aria-pressed={isSelected}
                className={cardClass}
            >
                {badge}
                {check}
                {body}
            </button>
        );
    };

    const canContinue = selected === 'resume'
        ? chosenResultId !== null
        : selected !== null;

    const handleContinue = () => {
        if (!selected) return;
        if (selected === 'resume') {
            const result = savedResults.find((r) => r.id === chosenResultId);
            if (result && result.scores) {
                onSelect('resume', { sessionId: result.session_id, scores: result.scores });
            }
        } else {
            onSelect(selected);
        }
    };

    return (
        <section className="space-y-5">
            <div className="flex items-center gap-3">
                {onBack && <BackButton onClick={onBack} label={t('nav.back')} />}
                <ForwardButton
                    onClick={handleContinue}
                    disabled={!canContinue}
                    label={t('counselor.continue')}
                />
            </div>
            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-5xl">
                {options.map((opt) => (
                    <div key={opt.key} className="flex-1 min-w-0">
                        {renderCard(opt)}
                    </div>
                ))}
            </div>
        </section>
    );
}
