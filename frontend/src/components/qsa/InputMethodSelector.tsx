'use client';

import { isReusableProfile } from '@/lib/questionnaires';

import { useState, useEffect } from 'react';
import { Check, Plus } from 'lucide-react';
import { QuestionnaireConfig, supportsProfileUpload } from '@/lib/questionnaires';
import { useI18n } from '@/lib/i18n-context';
import { BackButton } from '@/components/ui/BackButton';
import { ForwardButton } from '@/components/ui/ForwardButton';
import { QuestionnaireLink } from '@/components/ui/QuestionnaireLink';
import { cn } from '@/lib/utils';
import { getInputMethodPref } from '@/lib/session-prefs';
import { apiFetch, getIdentity } from '@/lib/auth';
import { canUseTeacherAssistant } from '@/lib/roles';
import { readStoredNotebookContext, readStoredPracticeNotebookId, storeNotebookContext, storePracticeNotebookId } from '@/lib/notebook-context';
import type { PracticeNotebook, PracticeResult } from '@/lib/practice-notebooks';
import { practiceNotebookApi } from '@/lib/practice-notebooks-api';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';

// Selezione del metodo di inserimento per il questionario.
// Stesso pattern del QuestionnaireSelector / CounselorSelector:
// si clicca la card per evidenziarla (badge check), poi si avanza con la
// freccia in alto e si torna indietro con la freccia. Nessun testo
// introduttivo: il FlowStepper in alto descrive già la fase.
// 'practice': un profilo del repertorio del taccuino di prova scelto.
// Strumenti senza punteggi (#837): 'test-student' avvia la chat sul taccuino
// dello studente di prova scelto, 'own' sul proprio account.
export type Method = 'manual' | 'upload' | 'resume' | 'practice' | 'test-student' | 'own';

interface SavedResult {
    id: number;
    session_id: string;
    questionnaire_type: string;
    scores: Record<string, number> | null;
    submitted_at: string;
}

interface InputMethodSelectorProps {
    onSelect: (method: Method, resumeData?: { sessionId: string; scores: Record<string, number> }, remember?: boolean) => void;
    onBack?: () => void;
    questionnaire?: QuestionnaireConfig;
    studentFlow?: boolean;
}

interface Option {
    key: Method;
    title: string;
    desc: string;
    badge?: string;
}

export function InputMethodSelector({ onSelect, onBack, questionnaire, studentFlow = false }: InputMethodSelectorProps) {
    const { t } = useI18n();
    const hasProfileUpload = questionnaire ? supportsProfileUpload(questionnaire.id) : false;
    // Strumento senza punteggi: la schermata serve solo a scegliere per chi è la chat.
    const unscored = questionnaire?.agentOnly === true;
    const manualDescription = questionnaire
        ? t('method.manual.descTpl', { name: questionnaire.name, codes: questionnaire.factors.map(f => f.code).join(', ') })
        : t('method.manual.descNoQ');
    const [remember, setRemember] = useState(() => getInputMethodPref() !== null);
    const [selectedState, setSelected] = useState<Method | null>(null);
    const [savedResults, setSavedResults] = useState<SavedResult[]>([]);
    const [chosenResultId, setChosenResultId] = useState<number | null>(null);
    // Docente in prova: studente simulato scelto (lo stesso delle Opzioni della
    // chat) e il suo repertorio per questo strumento. I risultati personali
    // restano visibili accanto.
    const [isTeacher, setIsTeacher] = useState(false);
    const [practiceNotebooks, setPracticeNotebooks] = useState<PracticeNotebook[]>([]);
    const [practiceId, setPracticeId] = useState<number | null>(() => !studentFlow && readStoredNotebookContext() === 'practice' ? readStoredPracticeNotebookId() : null);
    const [practiceResults, setPracticeResults] = useState<PracticeResult[]>([]);
    const [chosenPracticeResultId, setChosenPracticeResultId] = useState<number | null>(null);
    const practiceNotebook = studentFlow ? null : practiceNotebooks.find((notebook) => notebook.id === practiceId) ?? null;
    // Senza punteggi c'è sempre una scelta: lo studente di prova se è scelto, altrimenti il proprio account.
    const selected: Method | null = unscored && (selectedState === null || (selectedState === 'test-student' && !practiceNotebook))
        ? (practiceNotebook ? 'test-student' : 'own')
        : selectedState;
    // «Nuovo studente di prova…»: solo il nome, il profilo si completa nella Palestra.
    const [newName, setNewName] = useState<string | null>(null);
    const [createError, setCreateError] = useState(false);

    useEffect(() => {
        if (studentFlow) return;
        let active = true;
        getIdentity().then((identity) => {
            if (!active || !identity?.authenticated || !canUseTeacherAssistant(identity)) return;
            setIsTeacher(true);
            practiceNotebookApi.list().then((rows) => { if (active) setPracticeNotebooks(rows); }).catch(() => {});
        }).catch(() => {});
        return () => { active = false; };
    }, [studentFlow]);

    useEffect(() => {
        let active = true;
        if (!questionnaire || !practiceNotebook) {
            queueMicrotask(() => { if (active) setPracticeResults([]); });
            return () => { active = false; };
        }
        practiceNotebookApi.results(practiceNotebook.id, questionnaire.id)
            .then((rows) => { if (active) setPracticeResults(rows.filter(row => isReusableProfile(questionnaire.id, row.scores))); })
            .catch(() => { if (active) setPracticeResults([]); });
        return () => { active = false; };
    }, [questionnaire, practiceNotebook]);

    const changePractice = (id: number | null) => {
        setPracticeId(id);
        setChosenPracticeResultId(null);
        if (selected === 'practice') setSelected(null);
        if (unscored) setSelected(id !== null ? 'test-student' : 'own');
        if (id !== null) {
            storeNotebookContext('practice');
            storePracticeNotebookId(id);
        } else if (readStoredNotebookContext() === 'practice') {
            storeNotebookContext('default');
        }
    };

    const createPractice = async () => {
        const title = newName?.trim();
        if (!title) return;
        setCreateError(false);
        try {
            const created = await practiceNotebookApi.create(title, {});
            setPracticeNotebooks((rows) => [created, ...rows]);
            setNewName(null);
            changePractice(created.id);
        } catch {
            setCreateError(true);
        }
    };

    useEffect(() => {
        let cancelled = false;
        if (!questionnaire || unscored) {
            queueMicrotask(() => { if (!cancelled) setSavedResults([]); });
            return () => { cancelled = true; };
        }
        apiFetch('/api/user/questionnaire-results')
            .then((res) => res.ok ? res.json() : [])
            .then((all: SavedResult[]) => {
                if (cancelled) return;
                const filtered = all
                    .filter((r) => r.questionnaire_type === questionnaire.id && isReusableProfile(questionnaire.id, r.scores) && r.scores && Object.keys(r.scores).length > 0)
                    .sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());
                setSavedResults(filtered);
            })
            .catch(() => { if (!cancelled) setSavedResults([]); });
        return () => { cancelled = true; };
    }, [questionnaire, unscored]);

    const options: Option[] = unscored ? [
        ...(practiceNotebook ? [{
            key: 'test-student' as Method,
            title: t('method.chat.practice.title', { name: practiceNotebook.title }),
            desc: t('method.chat.practice.desc'),
            badge: t('method.practice.badge'),
        }] : []),
        { key: 'own', title: t('method.chat.own.title'), desc: t('method.chat.own.desc') },
    ] : [
        { key: 'manual', title: t('method.manual.title'), desc: manualDescription },
        ...(hasProfileUpload ? [{
            key: 'upload' as Method,
            title: t('method.upload.title'),
            desc: t('method.upload.desc'),
            badge: t('method.upload.badge'),
        }] : []),
        ...(practiceNotebook && practiceResults.length > 0 ? [{
            key: 'practice' as Method,
            title: t('method.practice.title', { name: practiceNotebook.title }),
            desc: t('method.practice.desc'),
            badge: t('method.practice.badge'),
        }] : []),
        ...(savedResults.length > 0 ? [{
            key: 'resume' as Method,
            title: t('method.resume.title'),
            desc: t('method.resume.desc'),
            badge: t('method.resume.badge'),
        }] : []),
    ];

    const renderCard = (opt: Option) => {
        const isSelected = selected === opt.key;
        const isTest = opt.key === 'test-student';
        // Riga piatta come EntryLink: niente riquadro, filetto sotto, fondo tenue se scelta.
        const cardClass = cn(
            'relative flex w-full cursor-pointer flex-col items-start gap-2 border-b border-line px-2 py-4 pr-12 text-left transition-colors',
            isSelected ? 'bg-brand-soft' : 'hover:bg-surface-sunken'
        );
        const badge = opt.badge && (isTest
            ? <RoleBadge role="test">{opt.badge}</RoleBadge>
            : <span className="text-xs text-ink-muted">{opt.badge}</span>);
        const check = isSelected && (
            <div className="absolute right-2 top-4 rounded-full bg-brand p-1 text-ink-on-brand">
                <Check className="h-3.5 w-3.5" />
            </div>
        );
        const body = (
            <>
                <span className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-ink">{opt.title}</h3>
                    {badge}
                </span>
                <p className="text-sm leading-relaxed text-ink-muted">{opt.desc}</p>
            </>
        );

        // Come "resume": la card contiene un <select>.
        if (opt.key === 'practice') {
            const choose = () => {
                const result = practiceResults.find((r) => r.id === chosenPracticeResultId);
                if (result) onSelect('practice', { sessionId: result.session_id, scores: result.scores });
            };
            return (
                <div
                    key={opt.key}
                    role="button"
                    tabIndex={0}
                    data-method-practice
                    onClick={() => setSelected(opt.key)}
                    onDoubleClick={() => { setSelected(opt.key); choose(); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(opt.key); } }}
                    aria-pressed={isSelected}
                    className={cardClass}
                >
                    {check}
                    {body}
                    {isSelected && (
                        <div className="w-full" onClick={(e) => e.stopPropagation()}>
                            <Select
                                aria-label={t('method.practice.placeholder')}
                                value={chosenPracticeResultId ?? ''}
                                onChange={(e) => setChosenPracticeResultId(e.target.value ? Number(e.target.value) : null)}
                            >
                                <option value="">{t('method.practice.placeholder')}</option>
                                {practiceResults.map((r) => (
                                    <option key={r.id} value={r.id}>
                                        {r.created_at ? new Date(r.created_at).toLocaleDateString() : ''} · {Object.entries(r.scores).slice(0, 4).map(([code, value]) => `${code} ${value}`).join(' · ')}
                                    </option>
                                ))}
                            </Select>
                        </div>
                    )}
                </div>
            );
        }

        // La card "resume" contiene un <select>, non può essere un <button>.
        if (opt.key === 'resume') {
            return (
                <div
                    key={opt.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(opt.key)}
                    onDoubleClick={() => {
                        setSelected(opt.key);
                        if (chosenResultId !== null) {
                            const result = savedResults.find((r) => r.id === chosenResultId);
                            if (result && result.scores) {
                                onSelect('resume', { sessionId: result.session_id, scores: result.scores });
                            }
                        }
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(opt.key); } }}
                    aria-pressed={isSelected}
                    className={cardClass}
                >
                    {check}
                    {body}
                    {isSelected && savedResults.length > 0 && (
                        <div className="w-full" onClick={(e) => e.stopPropagation()}>
                            <Select
                                aria-label={t('method.resume.placeholder')}
                                value={chosenResultId ?? ''}
                                onChange={(e) => setChosenResultId(e.target.value ? Number(e.target.value) : null)}
                            >
                                <option value="">{t('method.resume.placeholder')}</option>
                                {savedResults.map((r) => (
                                    <option key={r.id} value={r.id}>
                                        {new Date(r.submitted_at).toLocaleString()} · {r.session_id.slice(0, 8)}
                                    </option>
                                ))}
                            </Select>
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
                onDoubleClick={() => {
                    setSelected(opt.key);
                    onSelect(opt.key, undefined, remember);
                }}
                aria-pressed={isSelected}
                className={cardClass}
            >
                {check}
                {body}
            </button>
        );
    };

    const canContinue = selected === 'resume'
        ? chosenResultId !== null
        : selected === 'practice'
            ? chosenPracticeResultId !== null
            : selected !== null;

    const handleContinue = () => {
        if (!selected) return;
        if (selected === 'resume') {
            const result = savedResults.find((r) => r.id === chosenResultId);
            if (result && result.scores) {
                onSelect('resume', { sessionId: result.session_id, scores: result.scores });
            }
        } else if (selected === 'practice') {
            const result = practiceResults.find((r) => r.id === chosenPracticeResultId);
            if (result) onSelect('practice', { sessionId: result.session_id, scores: result.scores });
        } else if (selected === 'own' && readStoredNotebookContext() === 'practice') {
            // Con i propri dati la chat non deve leggere il taccuino rimasto in memoria.
            storeNotebookContext('default');
            onSelect('own');
        } else {
            onSelect(selected, undefined, remember);
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
            {/* E' la schermata che chiede i punteggi: qui la domanda "e dove li
                prendo?" arriva davvero, e finora non aveva risposta. */}
            {questionnaire && <QuestionnaireLink instrument={questionnaire.id} className="max-w-5xl" />}
            {isTeacher && !studentFlow && (practiceNotebooks.length > 0 || unscored) && (
                <div data-practice-student className={cn('max-w-5xl space-y-2 rounded-card border p-4 text-sm',
                    practiceNotebook ? 'border-role-test-line bg-role-test-soft text-ink' : 'border-line bg-surface text-ink-body')}>
                    <label className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{t('method.practice.student')}</span>
                        <Select value={newName !== null ? 'new' : practiceNotebook ? String(practiceNotebook.id) : ''}
                            onChange={(event) => {
                                if (event.target.value === 'new') { setNewName(''); setCreateError(false); return; }
                                setNewName(null);
                                changePractice(event.target.value ? Number(event.target.value) : null);
                            }}
                            className="w-auto flex-1">
                            <option value="">{t('method.practice.none')}</option>
                            {practiceNotebooks.map((notebook) => <option key={notebook.id} value={notebook.id}>{notebook.title}</option>)}
                            <option value="new">{t('method.practice.new')}</option>
                        </Select>
                    </label>
                    {newName !== null && (
                        <form data-practice-new className="flex flex-wrap items-center gap-2"
                            onSubmit={(event) => { event.preventDefault(); void createPractice(); }}>
                            <Input autoFocus aria-label={t('method.practice.newName')} placeholder={t('method.practice.newName')}
                                value={newName} onChange={(event) => setNewName(event.target.value)} maxLength={120}
                                className="w-auto flex-1" />
                            <Button type="submit" disabled={!newName.trim()}>
                                <Plus className="h-4 w-4" aria-hidden />{t('method.practice.create')}
                            </Button>
                            <Button type="button" variant="secondary" onClick={() => { setNewName(null); setCreateError(false); }}>{t('common.cancel')}</Button>
                            {createError && <p role="alert" className="w-full text-xs text-danger">{t('method.practice.createError')}</p>}
                        </form>
                    )}
                    {practiceNotebook && !unscored && <p className="text-xs text-role-test-muted">{t('method.practice.saveHint', { name: practiceNotebook.title })}</p>}
                </div>
            )}
            <div className="w-full max-w-5xl border-t border-line">
                {options.map((opt) => (
                    <div key={opt.key} className="min-w-0">
                        {renderCard(opt)}
                    </div>
                ))}
            </div>
            {!unscored && selected !== 'resume' && selected !== 'practice' && (
                <label className="flex min-h-control items-center gap-4 text-sm text-ink-body">
                    <input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} className="h-4 w-4 accent-brand" />
                    {t('method.remember')}
                </label>
            )}
        </section>
    );
}
