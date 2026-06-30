'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QUESTIONNAIRES, QuestionnaireConfig, QuestionnaireType } from '@/lib/questionnaires';
import { QuestionnaireSelector } from '@/components/questionnaire/QuestionnaireSelector';
import { CounselorSelector } from '@/components/questionnaire/CounselorSelector';
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
import { MessageSquare, Terminal, LogIn } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { FlowStepper } from '@/components/ui/FlowStepper';
import { CompassMark } from '@/components/ui/CompassMark';
import { toast } from '@/components/ui/Toast';
import { useI18n } from '@/lib/i18n-context';
import { addCompletedProfile, hasCompletedAll, getCombinedScoresContext, clearCompletedProfiles, getCompletedProfiles } from '@/lib/profile-tracker';
import { apiFetch, ai4authLoginUrl, getIdentity, type Identity } from '@/lib/auth';
import { getSelectedCounselorId, setSelectedCounselorId } from '@/lib/counselor';
import { setSelectedInstrumentId } from '@/lib/instrument';
import { getResume, setResume } from '@/lib/resume';
import { BackButton } from '@/components/ui/BackButton';
import { ForwardButton } from '@/components/ui/ForwardButton';


type Step = 'intro' | 'counselor-select' | 'questionnaire-select' | 'method-select' | 'manual-input' | 'upload-input' | 'dashboard' | 'interaction' | 'completed' | 'combined-interaction' | 'farewell';

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

// Intro: orienta e fa partire, poi racconta cosa si può fare. Hero centrato (unico
// segno: la bussola) + sezione "cosa puoi fare" a 3 voci con micro-marcatore petrol,
// senza icone. Niente blocco "come si prosegue" (è lo stepper) né card pesanti.
function IntroScreen({ onStart }: { onStart: () => void }) {
    const { t } = useI18n();
    const modes = [
        { title: t('app.overview.questionnaires.title'), body: t('app.overview.questionnaires.body') },
        { title: t('app.overview.savickas.title'), body: t('app.overview.savickas.body') },
        { title: t('app.overview.pqbl.title'), body: t('app.overview.pqbl.body') },
    ];

    return (
        <div className="space-y-12 py-4">
            <div className="flex flex-col items-center pt-4 text-center">
                <CompassMark className="h-14 w-14" />
                <h1 className="font-display mt-6 text-4xl font-bold text-slate-900 sm:text-5xl">CounselorBot</h1>
                <p className="mt-4 max-w-xl text-lg leading-relaxed text-slate-600">
                    {t('app.intro.subtitle')}
                </p>
                <button
                    type="button"
                    onClick={onStart}
                    className="mt-8 inline-flex items-center rounded-md bg-ochre-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-ochre-600"
                >
                    {t('app.home.cta')}
                </button>
            </div>

            <section className="mx-auto max-w-4xl">
                <h2 className="text-center text-sm font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {t('app.home.contains')}
                </h2>
                <div className="mt-6 grid gap-8 sm:grid-cols-3">
                    {modes.map((m) => (
                        <div key={m.title}>
                            <span className="block h-0.5 w-10 rounded-full bg-indigo-500" />
                            <h3 className="mt-3 text-base font-bold text-slate-900">{m.title}</h3>
                            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{m.body}</p>
                        </div>
                    ))}
                </div>
            </section>

            <footer className="mx-auto max-w-xl border-t border-slate-100 pt-8 text-center">
                <p className="text-sm leading-relaxed text-slate-500">{t('app.intro.contact')}</p>
                <p className="mt-2 text-sm font-semibold text-slate-700">Daniele Dragoni</p>
                <a
                    href="mailto:daniele.dragoni@uniroma3.it"
                    className="text-sm font-medium text-indigo-700 hover:underline"
                >
                    daniele.dragoni@uniroma3.it
                </a>
            </footer>
        </div>
    );
}

export default function Home() {
    const { t, lang } = useI18n();
    const [identity, setIdentity] = useState<Identity | null | undefined>(undefined);
    const [step, setStep] = useState<Step>('intro');
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
        getIdentity().then(setIdentity);
    }, []);

    // Il chip counselor nell'header deve comparire solo DOPO la scelta: sull'intro
    // azzeriamo la selezione persistita da run precedenti, così non si vede in anticipo.
    useEffect(() => {
        if (step === 'intro') {
            setSelectedCounselorId(null);
            setSelectedInstrumentId(null);
        }
    }, [step]);

    useEffect(() => {
        if (identity === undefined || !identity?.authenticated) return;

        const params = new URLSearchParams(window.location.search);

        // Riprendi la sessione interrotta (pulsante header): torna dritto alla chat.
        if (params.get('resume')) {
            const r = getResume();
            window.history.replaceState(null, '', window.location.pathname);
            if (r && QUESTIONNAIRES[r.instrument as QuestionnaireType]) {
                const q = QUESTIONNAIRES[r.instrument as QuestionnaireType];
                const profiles = getCompletedProfiles();
                const profile = profiles.find((p) => p.sessionId === r.sessionId)
                    ?? profiles.find((p) => p.questionnaireType === r.instrument);
                setSelectedQuestionnaire(q);
                setSelectedInstrumentId(r.instrument);
                if (r.counselorId != null) setSelectedCounselorId(r.counselorId);
                setSessionId(r.sessionId);
                setScores(profile?.scores && Object.keys(profile.scores).length ? profile.scores : {});
                setExperience(r.experience);
                setProfileReviewed(true);
                setStep('interaction');
                return;
            }
        }

        if (params.get('view') === 'questionnaires') {
            setSelectedQuestionnaire(null);
            setScores(null);
            setPdfToken(undefined);
            setSessionId('');
            setExperience(null);
            setProfileReviewed(false);
            setStep('questionnaire-select');
            window.history.replaceState(null, '', window.location.pathname);
            return;
        }

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
            setSelectedInstrumentId(questionnaire.id);
            setSessionId(resumeSession);
            setScores(profile?.scores && Object.keys(profile.scores).length ? profile.scores : {});
            setProfileReviewed(false);
            setExperience(null);
            setStep('counselor-select');
            window.history.replaceState(null, '', window.location.pathname);
            return;
        }

        const requestedId = params.get('start') as QuestionnaireType | null;
        if (!requestedId || !STARTABLE_QUESTIONNAIRES.includes(requestedId)) return;

        const questionnaire = QUESTIONNAIRES[requestedId];
        setSelectedQuestionnaire(questionnaire);
        setSelectedInstrumentId(questionnaire.id);
        setScores(null);
        setPdfToken(undefined);
        setSessionId('');
        setExperience(null);
        setProfileReviewed(false);
        setStep('counselor-select');
        window.history.replaceState(null, '', window.location.pathname);
    }, [identity]);

    const startAgentOnlyQuestionnaire = async (questionnaire: QuestionnaireConfig) => {
        const existingSessionId = sessionId;
        const newSessionId = existingSessionId || generateUUID();
        setSessionId(newSessionId);
        setScores({});

        if (!existingSessionId) {
            addCompletedProfile(questionnaire.id, newSessionId, {});
            try {
                await apiFetch('/api/questionnaire-result', {
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
        }

        setProfileReviewed(false);
        setExperience(null);
        setStep('interaction');
    };

    const handleQuestionnaireSelect = (questionnaire: QuestionnaireConfig) => {
        setSelectedQuestionnaire(questionnaire);
        setSelectedInstrumentId(questionnaire.id);
        setScores(null);
        setPdfToken(undefined);
        setSessionId('');
        setExperience(null);
        setProfileReviewed(false);
        setStep('counselor-select');
    };

    const continueAfterCounselorSelection = async () => {
        if (!selectedQuestionnaire) {
            setStep('questionnaire-select');
            return;
        }
        if (isAgentOnly(selectedQuestionnaire)) {
            await startAgentOnlyQuestionnaire(selectedQuestionnaire);
            return;
        }
        setStep(scores !== null ? 'dashboard' : 'method-select');
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
        if (!getSelectedCounselorId()) {
            toast.info('Scegli un counselor prima di iniziare il percorso.');
            setStep('counselor-select');
            return;
        }
        const newSessionId = generateUUID();
        setSessionId(newSessionId);
        const qType = selectedQuestionnaire?.id || 'QSA';
        addCompletedProfile(qType, newSessionId, scores || {});

        // Log Audit
        try {
            await apiFetch('/api/qsa/audit', {
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
            await apiFetch('/api/questionnaire-result', {
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

    // Scelta modalità chat: apre la chat e registra il punto di ripresa (header "Riprendi").
    const chooseExperience = (exp: 'standard' | 'opencode') => {
        setExperience(exp);
        if (selectedQuestionnaire) {
            setResume({ instrument: selectedQuestionnaire.id, sessionId, experience: exp, counselorId: getSelectedCounselorId() });
        }
    };

    const handleInteractionComplete = () => {
        setResume(null);
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
            await apiFetch('/api/questionnaire-result', {
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
        setResume(null);
        setCombinedScores(null);
        setCombinedContext('');
        setScores(null);
        setSelectedQuestionnaire(null);
        setPdfToken(undefined);
        setExperience(null);
        setSelectedCounselorId(null);
        setStep('intro');
    };

    const analyzeAnother = () => {
        setResume(null);
        setScores(null);
        setSelectedQuestionnaire(null);
        setPdfToken(undefined);
        setExperience(null);
        setSelectedCounselorId(null);
        setStep('intro');
    };

    const goBack = () => {
        if (step === 'questionnaire-select') setStep('intro');
        else if (step === 'counselor-select') setStep('questionnaire-select');
        else if (step === 'method-select') setStep('counselor-select');
        else if (step === 'manual-input' || step === 'upload-input') setStep('method-select');
        else if (step === 'dashboard') setStep('manual-input');
        else if (step === 'interaction') setStep(isAgentOnly(selectedQuestionnaire) ? 'counselor-select' : 'dashboard');
        else if (step === 'completed') setStep('dashboard');
        else if (step === 'farewell') setStep('completed');
        else if (step === 'combined-interaction') setStep('completed');
    };

    const getStepTitle = () => {
        switch (step) {
            case 'intro': return 'CounselorBot';
            case 'counselor-select': return 'Scegli il counselor';
            case 'questionnaire-select': return 'CounselorBot';
            case 'method-select': return `${selectedQuestionnaire?.name} — ${t('step.methodSelect.titleSuffix')}`;
            case 'manual-input': return t('step.manualInput.title');
            case 'upload-input': return t('step.uploadInput.title');
            case 'dashboard': return t('step.dashboard.title');
            case 'interaction': return selectedQuestionnaire?.id === 'SAVICKAS' ? t('step.interaction.title.savickas') : t('step.interaction.title.guided');
            case 'combined-interaction': return 'Analisi Combinata dei Profili';
            case 'completed': return t('step.completed.title');
            case 'farewell': return t('step.farewell.title');
            default: return 'CounselorBot';
        }
    };

    const getStepDescription = () => {
        switch (step) {
            case 'counselor-select': return 'Dopo lo strumento, scegli l’approccio con cui vuoi affrontare il percorso.';
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
            case 'farewell': return t('step.farewell.desc');
            default: return '';
        }
    };

    if (identity === undefined) {
        return (
            <div className="page-narrow">
                <div className="glass-panel p-8 text-center text-sm text-slate-500">
                    Caricamento accesso...
                </div>
            </div>
        );
    }

    if (!identity?.authenticated) {
        return (
            <div className="page-narrow">
                <div className="glass-panel p-8 text-center space-y-5">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Accesso richiesto</h1>
                        <p className="mt-2 text-sm leading-relaxed text-slate-600">
                            Accedi con il tuo account per usare CounselorBot, scegliere un counselor e salvare il percorso.
                        </p>
                    </div>
                    <a
                        href={ai4authLoginUrl('/')}
                        className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                        <LogIn className="h-4 w-4" />
                        Accedi a CounselorBot
                    </a>
                </div>
            </div>
        );
    }

    // Orientamento percorso: mappa lo step interno alle fasi visibili. Il taccuino
    // si rivede a inizio interaction (prima della chat) → tappa a sé tra Profilo e Conversa.
    const flowStages = ['CounselorBot', t('flow.select'), 'Counselor', t('flow.input'), t('flow.profile'), t('flow.taccuino'), t('flow.chat'), t('flow.done')];
    const inTaccuino = step === 'interaction' && experience === null && !profileReviewed;
    const stageIndex =
        step === 'intro' ? 0
            : step === 'questionnaire-select' ? 1
                : step === 'counselor-select' ? 2
                    : step === 'method-select' || step === 'manual-input' || step === 'upload-input' ? 3
                        : step === 'dashboard' ? 4
                            : inTaccuino ? 5
                                : step === 'interaction' || step === 'combined-interaction' ? 6
                                    : 7;

    return (
        <div className="page-wide space-y-8">
            {step !== 'intro' && <FlowStepper steps={flowStages} current={stageIndex} />}

            {/* The selection screen owns its introduction to avoid repeating the page purpose. */}
            {/* method-select e manual-input gestiscono la loro "prima riga" */}
            {/* internamente (BackButton + ForwardButton), come strumenti/counselor. */}
            {step !== 'intro' && step !== 'questionnaire-select' && step !== 'counselor-select' && step !== 'dashboard' && step !== 'interaction' && step !== 'method-select' && step !== 'manual-input' && step !== 'upload-input' && (
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
                    {/* Step: Intro */}
                    {step === 'intro' && (
                        <IntroScreen onStart={() => setStep('questionnaire-select')} />
                    )}

                    {/* Step: Counselor Selection */}
                    {step === 'counselor-select' && (
                        <CounselorSelector
                            questionnaireName={selectedQuestionnaire?.name}
                            onBack={goBack}
                            onContinue={() => {
                                void continueAfterCounselorSelection();
                            }}
                        />
                    )}

                    {/* Step: Questionnaire Selection */}
                    {step === 'questionnaire-select' && (
                        <QuestionnaireSelector onSelect={handleQuestionnaireSelect} onBack={goBack} />
                    )}

                    {/* Step: Input Method Selection */}
                    {step === 'method-select' && selectedQuestionnaire && (
                        <InputMethodSelector onSelect={handleMethodSelect} onBack={goBack} questionnaire={selectedQuestionnaire} />
                    )}

                    {/* Step: Manual Input */}
                    {step === 'manual-input' && selectedQuestionnaire && (
                        <ScoreInputForm questionnaire={selectedQuestionnaire} onSubmit={handleScoresSubmit} initialScores={scores || undefined} onBack={goBack} />
                    )}

                    {/* Step: PDF Upload */}
                    {step === 'upload-input' && selectedQuestionnaire && (
                        <PDFUploader
                            questionnaire={selectedQuestionnaire}
                            onUploadComplete={handleUploadComplete}
                            onBack={goBack}
                        />
                    )}

                    {/* Step: Dashboard with Profile. */}
                    {step === 'dashboard' && scores && selectedQuestionnaire && (
                        <div className="space-y-4 animate-fade-in-up">
                            <div className="flex items-center gap-3">
                                <BackButton onClick={goBack} label={t('nav.back')} />
                                <ForwardButton onClick={startInteraction} label={t('dashboard.ready.btn')} />
                            </div>
                            <ProfileVisualization scores={scores} questionnaire={selectedQuestionnaire} />
                        </div>
                    )}

                    {/* Step: Guided Chat Interaction */}
                    {step === 'interaction' && scores && selectedQuestionnaire && (
                        <div className="space-y-6">
                            {!(experience === null && !profileReviewed) && (
                                <BackButton onClick={goBack} label={t('nav.back')} />
                            )}
                            {experience === null && !profileReviewed ? (
                                /* Schermata 1: profilo studente, a tutta pagina. La card guida
                                   l'avanzamento con la "prima riga" uniforme (back + matita +
                                   freccia destra) e si auto-salta se non c'è nulla. */
                                <LearnerProfileCard
                                    variant="review"
                                    sessionId={sessionId}
                                    requireInitial
                                    onDone={() => setProfileReviewed(true)}
                                    onUnavailable={() => setProfileReviewed(true)}
                                    onBack={goBack}
                                />
                            ) : experience === null ? (
                                /* Schermata 2: scelta modalità, compatta (tasti piccoli, affiancati). */
                                <div className="max-w-md mx-auto">
                                    <div className="glass-panel p-6 text-center space-y-4">
                                        <div>
                                            <h3 className="text-base font-semibold text-slate-800">{t('experience.choose.title')}</h3>
                                            <p className="text-sm text-slate-500 mt-1">{t('experience.choose.sub')}</p>
                                        </div>
                                        <div className="grid sm:grid-cols-2 gap-2.5">
                                            <button
                                                onClick={() => chooseExperience('standard')}
                                                className="w-full py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-md transition-colors flex items-center justify-center gap-2"
                                            >
                                                <MessageSquare className="w-4 h-4" />
                                                {t('guided.mode.guided')}
                                            </button>
                                            <button
                                                onClick={() => chooseExperience('opencode')}
                                                className="w-full py-2.5 px-3 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-md transition-colors flex items-center justify-center gap-2"
                                            >
                                                <Terminal className="w-4 h-4" />
                                                {t('guided.mode.sandbox')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : experience === 'standard' ? (
                                /* Schermata 3: chat (modalità già scelta, nessun toggle in alto). */
                                <GuidedChatInterface
                                    scores={scores}
                                    questionnaireType={selectedQuestionnaire.id}
                                    onComplete={handleInteractionComplete}
                                    sessionId={sessionId}
                                    locale={lang}
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
                        </div>
                    )}

                    {/* Step: Combined Profile Analysis */}
                    {step === 'combined-interaction' && combinedScores && (
                        <GuidedChatInterface
                            scores={combinedScores}
                            questionnaireType={'QSA'}
                            onComplete={handleCombinedComplete}
                            sessionId={sessionId}
                            locale={lang}
                            scoresContextOverride={combinedContext}
                        />
                    )}

                    {/* Step: Completed - Ask for another analysis */}
                    {step === 'completed' && (
                        <div className="max-w-xl mx-auto">
                            <div className="glass-panel p-8 text-center space-y-6">
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
                                            className="w-full py-3.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-md transition-colors flex items-center justify-center shadow-md"
                                        >
                                            {t('completed.combined')}
                                        </button>
                                    </div>
                                )}

                                <div className="grid grid-cols-3 gap-4 pt-4">
                                    <button
                                        onClick={analyzeAnother}
                                        className="py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md transition-colors flex items-center justify-center"
                                    >
                                        {t('completed.another')}
                                    </button>
                                    <button
                                        onClick={async () => {
                                            try {
                                                const res = await apiFetch(`/api/questionnaire-result/${sessionId}/pdf?lang=${lang}`);
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
                                        className="py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md transition-colors flex items-center justify-center"
                                    >
                                        {t('completed.downloadPdf')}
                                    </button>
                                    <button
                                        onClick={() => setStep('farewell')}
                                        className="py-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold rounded-md transition-colors flex items-center justify-center"
                                    >
                                        {t('completed.end')}
                                    </button>
                                </div>

                                <p className="pt-4 border-t border-slate-100 text-sm text-slate-400">
                                    {t('completed.thanks')}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Step: Farewell — commiato, feedback opzionale e ritorno all'inizio del percorso. */}
                    {step === 'farewell' && (
                        <div className="max-w-xl mx-auto">
                            <div className="glass-panel p-8 text-center space-y-6">
                                <div>
                                    <h2 className="text-2xl font-bold text-slate-800">{t('farewell.title')}</h2>
                                    <p className="text-slate-500 mt-3">
                                        {t('farewell.body')}
                                    </p>
                                </div>

                                <div className="space-y-4 pt-4">
                                    <a
                                        href="/questionario"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block w-full py-3.5 bg-ochre-500 hover:bg-ochre-600 text-white font-bold rounded-md transition-colors shadow-md"
                                    >
                                        {t('farewell.feedback')}
                                    </a>
                                    <button
                                        onClick={() => {
                                            setSelectedCounselorId(null);
                                            setStep('intro');
                                        }}
                                        className="w-full py-3.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold rounded-md transition-colors"
                                    >
                                        {t('farewell.home')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
