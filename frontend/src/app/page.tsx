'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QUESTIONNAIRES, QuestionnaireConfig, QuestionnaireType } from '@/lib/questionnaires';
import { QuestionnaireSelector } from '@/components/questionnaire/QuestionnaireSelector';
import { InputMethodSelector } from '@/components/qsa/InputMethodSelector';
import { ScoreInputForm } from '@/components/qsa/ScoreInputForm';
import { PDFUploader } from '@/components/qsa/PDFUploader';
import { ProfileVisualization } from '@/components/qsa/ProfileVisualization';
import { GuidedChatInterface } from '@/components/qsa/GuidedChatInterface';
import { LearnerProfileCard } from '@/components/profile/LearnerProfileCard';
import dynamic from 'next/dynamic';

const OpenCodeExperience = dynamic(
    () => import('@/components/qsa/OpenCodeExperience').then((mod) => mod.OpenCodeExperience),
    { ssr: false }
);
import { CheckCircle2, MessageSquare, RotateCcw, LogOut, Download, Layers, Terminal } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { StickyActions } from '@/components/ui/StickyActions';
import { FlowStepper } from '@/components/ui/FlowStepper';
import { toast } from '@/components/ui/Toast';
import { useI18n } from '@/lib/i18n-context';
import { addCompletedProfile, hasCompletedAll, getCombinedScoresContext, clearCompletedProfiles, getCompletedProfiles } from '@/lib/profile-tracker';


type Step = 'questionnaire-select' | 'method-select' | 'manual-input' | 'upload-input' | 'dashboard' | 'interaction' | 'completed' | 'combined-interaction';

const STARTABLE_QUESTIONNAIRES: QuestionnaireType[] = ['QSA', 'QSAr', 'ZTPI', 'SAVICKAS', 'QPCS', 'QPCC', 'QAP'];

// Agent-only questionnaires skip the score-input flow and go straight to the AI-led
// guided chat. Currently only Savickas is agent-only.
const isAgentOnly = (q: QuestionnaireConfig | null) => q?.agentOnly === true;

// Safe UUID generation that works in HTTP (non-secure) contexts
function generateUUID() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export default function Home() {
    const { t, lang } = useI18n();
    const [step, setStep] = useState<Step>('questionnaire-select');
    const [selectedQuestionnaire, setSelectedQuestionnaire] = useState<QuestionnaireConfig | null>(null);
    const [scores, setScores] = useState<Record<string, number> | null>(null);
    const [sessionId, setSessionId] = useState<string>('');
    const [pdfToken, setPdfToken] = useState<string | undefined>(undefined);
    const [experience, setExperience] = useState<'standard' | 'opencode' | null>(null);
    // Schermata profilo studente separata dalla scelta modalità: true = già rivisto,
    // si passa alla scelta. Auto-skip se la card non ha nulla da mostrare.
    const [profileReviewed, setProfileReviewed] = useState(false);
    const [combinedScores, setCombinedScores] = useState<Record<string, number> | null>(null);
    const [combinedContext, setCombinedContext] = useState<string>('');

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);

        // Resume chat from a test administration: /?session_id=...&instrument=...
        const resumeSession = params.get('session_id');
        const resumeInstrument = params.get('instrument') as QuestionnaireType | null;
        if (resumeSession && resumeInstrument && QUESTIONNAIRES[resumeInstrument]) {
            const questionnaire = QUESTIONNAIRES[resumeInstrument];
            const profiles = getCompletedProfiles();
            const profile =
                profiles.find((p) => p.questionnaireType === resumeInstrument && p.sessionId === resumeSession)
                ?? profiles.find((p) => p.questionnaireType === resumeInstrument);
            setSelectedQuestionnaire(questionnaire);
            setSessionId(resumeSession);
            setScores(profile?.scores && Object.keys(profile.scores).length ? profile.scores : {});
            setProfileReviewed(false);
            setStep(isAgentOnly(questionnaire) ? 'interaction' : 'dashboard');
            window.history.replaceState(null, '', window.location.pathname);
            return;
        }

        const requestedId = params.get('start') as QuestionnaireType | null;
        if (!requestedId || !STARTABLE_QUESTIONNAIRES.includes(requestedId)) return;

        const questionnaire = QUESTIONNAIRES[requestedId];
        // A details page can deep-link into the same existing workflow.
        setSelectedQuestionnaire(questionnaire);
        if (isAgentOnly(questionnaire)) {
            const newSessionId = generateUUID();
            setSessionId(newSessionId);
            setScores({});
            addCompletedProfile(questionnaire.id, newSessionId, {});
            (async () => {
                try {
                    await fetch('/api/questionnaire-result', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            session_id: newSessionId,
                            questionnaire_type: questionnaire.id,
                            scores: {},
                        }),
                    });
                } catch (e) {
                    console.error("Failed to save questionnaire result", e);
                }
            })();
            setProfileReviewed(false);
            setStep('interaction');
        } else {
            setStep('method-select');
        }
        window.history.replaceState(null, '', window.location.pathname);
    }, []);

    const handleQuestionnaireSelect = async (questionnaire: QuestionnaireConfig) => {
        setSelectedQuestionnaire(questionnaire);
        if (isAgentOnly(questionnaire)) {
            const newSessionId = generateUUID();
            setSessionId(newSessionId);
            setScores({});
            addCompletedProfile(questionnaire.id, newSessionId, {});
            // Questionari condotti dall'AI: sessione senza punteggi
            try {
                await fetch('/api/questionnaire-result', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        session_id: newSessionId,
                        questionnaire_type: questionnaire.id,
                        scores: {},
                    }),
                });
            } catch (e) {
                console.error("Failed to save questionnaire result", e);
            }
            setProfileReviewed(false);
            setStep('interaction');
            return;
        }
        setStep('method-select');
    };

    const handleMethodSelect = (method: 'manual' | 'upload') => {
        setStep(method === 'manual' ? 'manual-input' : 'upload-input');
    };

    const handleScoresSubmit = (data: Record<string, number>) => {
        setScores(data);
        setStep('dashboard');
    };

    const handleUploadComplete = (data: Record<string, number>, token?: string) => {
        setScores(data);
        setPdfToken(token);
        setStep('dashboard');
    };

    const startInteraction = async () => {
        const newSessionId = generateUUID();
        setSessionId(newSessionId);
        const qType = selectedQuestionnaire?.id || 'QSA';
        addCompletedProfile(qType, newSessionId, scores || {});

        // Log Audit
        try {
            await fetch('/api/qsa/audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    scores: scores,
                    session_id: newSessionId,
                    questionnaire_type: qType,
                }),
            });
        } catch (e) {
            console.error("Failed to log audit", e);
        }

        // Salva risultati questionario su DB
        try {
            await fetch('/api/questionnaire-result', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: newSessionId,
                    questionnaire_type: qType,
                    scores: scores,
                }),
            });
        } catch (e) {
            console.error("Failed to save questionnaire result", e);
        }

        setProfileReviewed(false);
        setStep('interaction');
    };

    const handleInteractionComplete = () => {
        setStep('completed');
    };

    const handleCombinedStart = async () => {
        const newSessionId = generateUUID();
        const profiles = getCompletedProfiles();

        // Merge scores from all profiles (no key collision: QSA uses C/A, ZTPI uses T)
        const merged: Record<string, number> = {};
        for (const p of profiles) {
            Object.assign(merged, p.scores);
        }

        // Save combined questionnaire result to DB
        try {
            await fetch('/api/questionnaire-result', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: newSessionId,
                    questionnaire_type: 'COMBINED',
                    scores: merged,
                }),
            });
        } catch (e) {
            console.error('Failed to save combined result', e);
        }

        setCombinedScores(merged);
        setCombinedContext(getCombinedScoresContext());
        setSessionId(newSessionId);
        setStep('combined-interaction');
    };

    const handleCombinedComplete = () => {
        clearCompletedProfiles();
        setCombinedScores(null);
        setCombinedContext('');
        setScores(null);
        setSelectedQuestionnaire(null);
        setPdfToken(undefined);
        setExperience(null);
        setStep('questionnaire-select');
    };

    const analyzeAnother = () => {
        setScores(null);
        setSelectedQuestionnaire(null);
        setPdfToken(undefined);
        setExperience(null);
        setStep('questionnaire-select');
    };

    const goBack = () => {
        if (step === 'method-select') setStep('questionnaire-select');
        else if (step === 'manual-input' || step === 'upload-input') setStep('method-select');
        else if (step === 'dashboard') setStep('manual-input');
        else if (step === 'interaction') setStep(isAgentOnly(selectedQuestionnaire) ? 'questionnaire-select' : 'dashboard');
        else if (step === 'completed') setStep('dashboard');
        else if (step === 'combined-interaction') setStep('completed');
    };

    const getStepTitle = () => {
        switch (step) {
            case 'questionnaire-select': return 'CounselorBot';
            case 'method-select': return `${selectedQuestionnaire?.name} — ${t('step.methodSelect.titleSuffix')}`;
            case 'manual-input': return t('step.manualInput.title');
            case 'upload-input': return t('step.uploadInput.title');
            case 'dashboard': return t('step.dashboard.title');
            case 'interaction': return selectedQuestionnaire?.id === 'SAVICKAS' ? t('step.interaction.title.savickas') : t('step.interaction.title.guided');
            case 'combined-interaction': return 'Analisi Combinata dei Profili';
            case 'completed': return t('step.completed.title');
            default: return 'CounselorBot';
        }
    };

    const getStepDescription = () => {
        switch (step) {
            case 'questionnaire-select': return t('step.questionnaireSelect.desc');
            case 'method-select': return t('step.methodSelect.desc');
            case 'manual-input': return t('step.manualInput.desc');
            case 'upload-input': return t('step.uploadInput.desc');
            case 'dashboard': return `${t('step.dashboard.descPrefix')} ${selectedQuestionnaire?.name}`;
            case 'interaction':
                return selectedQuestionnaire?.id === 'SAVICKAS'
                    ? t('step.interaction.desc.savickas')
                    : `${t('step.interaction.desc.guidedPrefix')} ${selectedQuestionnaire?.name}`;
            case 'combined-interaction': return "Analisi integrata dei profili QSA, ZTPI e Savickas";
            case 'completed': return t('step.completed.desc');
            default: return '';
        }
    };

    // Orientamento percorso: mappa lo step interno alle 5 fasi visibili.
    const flowStages = [t('flow.select'), t('flow.input'), t('flow.profile'), t('flow.chat'), t('flow.done')];
    const stageIndex =
        step === 'questionnaire-select' ? 0
            : step === 'method-select' || step === 'manual-input' || step === 'upload-input' ? 1
                : step === 'dashboard' ? 2
                    : step === 'interaction' || step === 'combined-interaction' ? 3
                        : 4;

    return (
        <div className="page-wide space-y-8">
            <FlowStepper steps={flowStages} current={stageIndex} />

            {/* The selection screen owns its introduction to avoid repeating the page purpose. */}
            {step !== 'questionnaire-select' && (
                <PageHeader
                    title={getStepTitle()}
                    subtitle={getStepDescription()}
                    onBack={step !== 'completed' ? goBack : undefined}
                />
            )}

            <AnimatePresence mode="wait">
                <motion.div
                    key={step}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                >
                    {/* Step: Questionnaire Selection */}
                    {step === 'questionnaire-select' && (
                        <QuestionnaireSelector onSelect={handleQuestionnaireSelect} />
                    )}

                    {/* Step: Input Method Selection */}
                    {step === 'method-select' && selectedQuestionnaire && (
                        <InputMethodSelector onSelect={handleMethodSelect} questionnaire={selectedQuestionnaire} />
                    )}

                    {/* Step: Manual Input */}
                    {step === 'manual-input' && selectedQuestionnaire && (
                        <ScoreInputForm questionnaire={selectedQuestionnaire} onSubmit={handleScoresSubmit} initialScores={scores || undefined} />
                    )}

                    {/* Step: PDF Upload */}
                    {step === 'upload-input' && selectedQuestionnaire && (
                        <PDFUploader
                            questionnaire={selectedQuestionnaire}
                            onUploadComplete={handleUploadComplete}
                        />
                    )}

                    {/* Step: Dashboard with Profile.
                        CTA ancorata in fondo: il grafico (QSA = molti fattori) scorre sopra,
                        il bottone "Inizia" resta sempre visibile senza scrollare. */}
                    {step === 'dashboard' && scores && selectedQuestionnaire && (
                        <div className="space-y-4 animate-fade-in-up">
                            <ProfileVisualization scores={scores} questionnaire={selectedQuestionnaire} />

                            <StickyActions>
                                <div className="glass-panel px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3 shadow-md">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className="w-10 h-10 shrink-0 rounded-md bg-indigo-50 flex items-center justify-center">
                                            <MessageSquare className="w-5 h-5 text-indigo-600" />
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="text-sm font-semibold text-slate-800 truncate">{t('dashboard.ready.title')}</h3>
                                            <p className="text-xs text-slate-500 truncate">{t('dashboard.ready.sub')}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={startInteraction}
                                        className="shrink-0 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md transition-colors flex items-center justify-center gap-2"
                                    >
                                        <MessageSquare className="w-5 h-5" />
                                        {t('dashboard.ready.btn')}
                                    </button>
                                </div>
                            </StickyActions>
                        </div>
                    )}

                    {/* Step: Guided Chat Interaction */}
                    {step === 'interaction' && scores && selectedQuestionnaire && (
                        <div className="space-y-6">
                            {experience === null && !profileReviewed ? (
                                /* Schermata 1: profilo studente, a sé. La card guida l'avanzamento
                                   (Conferma/Salta) e si auto-salta se non c'è nulla / non autenticato. */
                                <div className="max-w-2xl mx-auto">
                                    <LearnerProfileCard
                                        variant="review"
                                        sessionId={sessionId}
                                        onDone={() => setProfileReviewed(true)}
                                        onUnavailable={() => setProfileReviewed(true)}
                                    />
                                </div>
                            ) : experience === null ? (
                                /* Schermata 2: scelta modalità, compatta (tasti piccoli, affiancati). */
                                <div className="max-w-md mx-auto">
                                    <div className="glass-panel p-6 text-center space-y-4">
                                        <div className="w-11 h-11 mx-auto rounded-md bg-indigo-50 flex items-center justify-center">
                                            <MessageSquare className="w-5 h-5 text-indigo-600" />
                                        </div>
                                        <div>
                                            <h3 className="text-base font-semibold text-slate-800">{t('experience.choose.title')}</h3>
                                            <p className="text-sm text-slate-500 mt-1">{t('experience.choose.sub')}</p>
                                        </div>
                                        <div className="grid sm:grid-cols-2 gap-2.5">
                                            <button
                                                onClick={() => setExperience('standard')}
                                                className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-md transition-colors flex items-center justify-center gap-2"
                                            >
                                                <MessageSquare className="w-4 h-4" />
                                                {t('guided.mode.guided')}
                                            </button>
                                            <button
                                                onClick={() => setExperience('opencode')}
                                                className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-md transition-colors flex items-center justify-center gap-2"
                                            >
                                                <Terminal className="w-4 h-4" />
                                                {t('guided.mode.sandbox')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* Schermata 3: chat (profilo già rivisto, non ripetuto qui). */
                                <>
                                    {/* Toggle Experience Selector */}
                                    <div className="flex justify-center bg-slate-100 p-1 rounded-lg max-w-sm mx-auto border border-slate-200 shadow-sm">
                                        <button
                                            onClick={() => setExperience('standard')}
                                            className={`flex-1 py-1.5 px-3 rounded-md font-semibold text-xs transition-all flex items-center justify-center gap-1.5 ${
                                                experience === 'standard'
                                                    ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/55'
                                                    : 'text-slate-500 hover:text-slate-800'
                                            }`}
                                        >
                                            <MessageSquare className="w-3.5 h-3.5" />
                                            {t('guided.mode.guided')}
                                        </button>
                                        <button
                                            onClick={() => setExperience('opencode')}
                                            className={`flex-1 py-1.5 px-3 rounded-md font-semibold text-xs transition-all flex items-center justify-center gap-1.5 ${
                                                experience === 'opencode'
                                                    ? 'bg-white text-indigo-700 shadow-sm border border-slate-200/55'
                                                    : 'text-slate-500 hover:text-slate-800'
                                            }`}
                                        >
                                            <Terminal className="w-3.5 h-3.5" />
                                            {t('guided.mode.sandbox')}
                                        </button>
                                    </div>

                                    {experience === 'standard' ? (
                                        <GuidedChatInterface
                                            scores={scores}
                                            questionnaireType={selectedQuestionnaire.id}
                                            onComplete={handleInteractionComplete}
                                            sessionId={sessionId}
                                        />
                                    ) : (
                                        <OpenCodeExperience
                                            scores={scores}
                                            questionnaire={selectedQuestionnaire}
                                            pdfToken={pdfToken}
                                            sessionId={sessionId}
                                            locale={lang}
                                        />
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {/* Step: Combined Profile Analysis */}
                    {step === 'combined-interaction' && combinedScores && (
                        <GuidedChatInterface
                            scores={combinedScores}
                            questionnaireType={'QSA'}
                            onComplete={handleCombinedComplete}
                            sessionId={sessionId}
                            scoresContextOverride={combinedContext}
                        />
                    )}

                    {/* Step: Completed - Ask for another analysis */}
                    {step === 'completed' && (
                        <div className="max-w-xl mx-auto">
                            <div className="glass-panel p-8 text-center space-y-6">
                                <div className="w-14 h-14 mx-auto rounded-md bg-green-50 flex items-center justify-center">
                                    <CheckCircle2 className="w-7 h-7 text-green-600" />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-800">{t('completed.title')}</h2>
                                    <p className="text-slate-500 mt-3">
                                        {t('completed.body1')} <strong>{selectedQuestionnaire?.name}</strong>.
                                        <br />
                                        {t('completed.body2')}
                                    </p>
                                </div>

                                {hasCompletedAll() && (
                                    <div className="pt-4">
                                        <button
                                            onClick={handleCombinedStart}
                                            className="w-full py-3.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-md transition-colors flex items-center justify-center gap-2 shadow-md"
                                        >
                                            <Layers className="w-5 h-5" />
                                            {t('completed.combined')}
                                        </button>
                                    </div>
                                )}

                                <div className="grid grid-cols-3 gap-4 pt-4">
                                    <button
                                        onClick={analyzeAnother}
                                        className="py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md transition-colors flex items-center justify-center gap-2"
                                    >
                                        <RotateCcw className="w-5 h-5" />
                                        {t('completed.another')}
                                    </button>
                                    <button
                                        onClick={async () => {
                                            try {
                                                const res = await fetch(`/api/questionnaire-result/${sessionId}/pdf?lang=${lang}`);
                                                if (!res.ok) throw new Error('PDF download failed');
                                                const blob = await res.blob();
                                                const url = window.URL.createObjectURL(blob);
                                                const a = document.createElement('a');
                                                a.href = url;
                                                a.download = `counselorbot_${selectedQuestionnaire?.id || 'questionario'}.pdf`;
                                                document.body.appendChild(a);
                                                a.click();
                                                a.remove();
                                                window.URL.revokeObjectURL(url);
                                            } catch (e) {
                                                console.error('Failed to download PDF', e);
                                                toast.error(t('toast.error'));
                                            }
                                        }}
                                        className="py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-md transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Download className="w-5 h-5" />
                                        {t('completed.downloadPdf')}
                                    </button>
                                    <button
                                        onClick={() => setStep('questionnaire-select')}
                                        className="py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold rounded-md transition-colors flex items-center justify-center gap-2"
                                    >
                                        <LogOut className="w-5 h-5" />
                                        {t('completed.end')}
                                    </button>
                                </div>

                                <div className="pt-4 border-t border-slate-100">
                                    <p className="text-sm text-slate-400 mb-3">
                                        {t('completed.thanks')}
                                    </p>
                                    <a
                                        href="/questionario"
                                        className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                                    >
                                        {t('completed.feedbackLink')}
                                    </a>
                                </div>
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
