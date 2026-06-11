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
import { ArrowLeft, CheckCircle2, MessageSquare, RotateCcw, LogOut, Download, Layers } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { addCompletedProfile, hasCompletedAll, getCombinedScoresContext, clearCompletedProfiles, getCompletedProfiles } from '@/lib/profile-tracker';


type Step = 'questionnaire-select' | 'method-select' | 'manual-input' | 'upload-input' | 'dashboard' | 'interaction' | 'completed' | 'combined-interaction';

const STARTABLE_QUESTIONNAIRES: QuestionnaireType[] = ['QSA', 'QSAr', 'ZTPI', 'SAVICKAS', 'QPCS', 'QPCC', 'QAP'];

// Agent-only questionnaires (Savickas + the perceived-competence/adaptability ones)
// skip the score-input flow and go straight to the AI-led guided chat.
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
            setStep('interaction');
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

    const handleUploadComplete = (data: Record<string, number>) => {
        setScores(data);
        setStep('manual-input');
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
        setStep('questionnaire-select');
    };

    const analyzeAnother = () => {
        setScores(null);
        setSelectedQuestionnaire(null);
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

    return (
        <div className="max-w-6xl mx-auto space-y-8">
            {/* The selection screen owns its introduction to avoid repeating the page purpose. */}
            {step !== 'questionnaire-select' && (
            <div className="flex items-center gap-4 mb-8">
                {step !== 'completed' && (
                    <button onClick={goBack} className="p-2 border border-transparent hover:border-slate-200 hover:bg-white rounded-md transition-colors">
                        <ArrowLeft className="w-5 h-5 text-slate-600" />
                    </button>
                )}
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">{getStepTitle()}</h1>
                    <p className="text-slate-500">{getStepDescription()}</p>
                </div>
            </div>
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

                    {/* Step: Dashboard with Profile */}
                    {step === 'dashboard' && scores && selectedQuestionnaire && (
                        <div className="space-y-8 animate-fade-in-up">
                            <ProfileVisualization scores={scores} questionnaire={selectedQuestionnaire} />

                            <div className="flex justify-center pt-8">
                                <div className="glass-panel p-8 rounded-lg text-center max-w-lg space-y-6">
                                    <div className="w-14 h-14 mx-auto rounded-md bg-indigo-50 flex items-center justify-center">
                                        <MessageSquare className="w-7 h-7 text-indigo-600" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-semibold text-slate-800">{t('dashboard.ready.title')}</h3>
                                        <p className="text-slate-500 mt-2">
                                            {t('dashboard.ready.sub')}
                                        </p>
                                    </div>
                                    <button
                                        onClick={startInteraction}
                                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md transition-colors flex items-center justify-center gap-2"
                                    >
                                        <MessageSquare className="w-5 h-5" />
                                        {t('dashboard.ready.btn')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Step: Guided Chat Interaction */}
                    {step === 'interaction' && scores && selectedQuestionnaire && (
                        <div className="space-y-6">
                            <LearnerProfileCard variant="review" sessionId={sessionId} />
                            <GuidedChatInterface
                                scores={scores}
                                questionnaireType={selectedQuestionnaire.id}
                                onComplete={handleInteractionComplete}
                                sessionId={sessionId}
                            />
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
                            <div className="glass-panel p-8 rounded-lg text-center space-y-6">
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
