'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { fetchOrientationStatus } from '@/lib/orientation-api';
import { QUESTIONNAIRES, QuestionnaireConfig, QuestionnaireType, supportsProfileUpload } from '@/lib/questionnaires';
import { QuestionnaireSelector } from '@/components/questionnaire/QuestionnaireSelector';
import { CounselorSelector } from '@/components/questionnaire/CounselorSelector';
import { InputMethodSelector } from '@/components/qsa/InputMethodSelector';
import { ScoreInputForm } from '@/components/qsa/ScoreInputForm';
import { PDFUploader } from '@/components/qsa/PDFUploader';
import { ProfileVisualization } from '@/components/qsa/ProfileVisualization';
import { ChatViewport } from '@/components/qsa/ChatViewport';
import { cn } from '@/lib/utils';
import { GuidedChatInterface } from '@/components/qsa/GuidedChatInterface';
import { SessionReport } from '@/components/qsa/SessionReport';
import { LearnerProfileCard } from '@/components/profile/LearnerProfileCard';
import { ReturningHome } from '@/components/home/ReturningHome';
import dynamic from 'next/dynamic';

const OpenCodeExperience = dynamic(
    () => import('@/components/qsa/OpenCodeExperience').then((mod) => mod.OpenCodeExperience),
    { ssr: false }
);
import { MessageSquare, Terminal, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FlowStepper } from '@/components/ui/FlowStepper';
import { CompassMark } from '@/components/ui/CompassMark';
import { toast } from '@/components/ui/Toast';
import { useI18n } from '@/lib/i18n-context';
import { addCompletedProfile, getCompletedProfiles } from '@/lib/profile-tracker';
import { apiFetch, ai4authLoginUrl, getIdentity, type Identity } from '@/lib/auth';
import { getSelectedCounselorId, setSelectedCounselorId } from '@/lib/counselor';
import { experiencePrefForInstrument, getExperiencePref, getInputMethodPref, setExperiencePref, setInputMethodPref } from '@/lib/session-prefs';
import { setSelectedInstrumentId } from '@/lib/instrument';
import { getResume, setResume } from '@/lib/resume';
import { deleteFrozenSession, getFrozenSession, type FrozenSessionDetail } from '@/lib/frozen-session';
import { BackButton } from '@/components/ui/BackButton';
import { ForwardButton } from '@/components/ui/ForwardButton';
import { shouldReviewNotebookBeforeInstrument } from '@/lib/notebook-flow';
import { isStartableQuestionnaireId } from '@/lib/tool-catalog';
import { enterStep, startTrail, stepAtDepth, type Trail } from '@/lib/flow-history';


type Step = 'intro' | 'base' | 'notebook' | 'counselor-select' | 'questionnaire-select' | 'method-select' | 'manual-input' | 'upload-input' | 'dashboard' | 'interaction' | 'completed' | 'farewell';

// Compilazioni già salvate: servono a sapere se c'è qualcosa da riusare prima
// di saltare la scelta del metodo di inserimento.
interface SavedResult {
    session_id: string;
    questionnaire_type: string;
    scores: Record<string, number> | null;
    submitted_at: string;
}

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

// Intro: orienta e fa partire, poi spiega. Hero centrato (unico segno: la bussola,
// animata) → "che cos'è" → "come funziona" a 4 passi numerati (mono ocra, registro
// strumento) → "cosa trovi" a 3 voci con micro-marcatore petrol → "cosa aspettarti"
// (onestà su natura AI e limiti). Senza icone né card pesanti.
function IntroScreen({ onStart }: { onStart: () => void }) {
    const { t } = useI18n();
    const modes = [
        { title: t('app.overview.questionnaires.title'), body: t('app.overview.questionnaires.body') },
        { title: t('app.overview.savickas.title'), body: t('app.overview.savickas.body') },
        { title: t('app.overview.pqbl.title'), body: t('app.overview.pqbl.body') },
    ];
    const howSteps = [
        { title: t('app.intro.how.s1.title'), body: t('app.intro.how.s1.body') },
        { title: t('app.intro.how.s2.title'), body: t('app.intro.how.s2.body') },
        { title: t('app.intro.how.s3.title'), body: t('app.intro.how.s3.body') },
        { title: t('app.intro.how.s4.title'), body: t('app.intro.how.s4.body') },
    ];

    return (
        <div className="space-y-12 py-4">
            <div className="flex flex-col items-center pt-4 text-center">
                <CompassMark className="h-16 w-16" animated />
                <h1 className="font-display mt-6 text-4xl font-bold text-slate-900 sm:text-5xl">CounselorBot</h1>
                <p className="mt-4 max-w-xl text-lg leading-relaxed text-slate-600">
                    {t('app.intro.subtitle')}
                </p>
                <Button type="button" variant="accent" size="lg" onClick={onStart} className="mt-8">
                    {t('app.home.cta')}
                </Button>
            </div>

            <section className="mx-auto max-w-2xl text-center">
                <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {t('app.intro.what.title')}
                </h2>
                <p className="mt-4 text-base leading-relaxed text-slate-600">
                    {t('app.intro.what.body')}
                </p>
            </section>

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
                <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed text-slate-500">
                    {t('app.intro.langs.pre')}
                    <a
                        href="https://www.competenzestrategiche.it/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-indigo-700 hover:underline"
                    >
                        competenzestrategiche.it
                    </a>
                    {t('app.intro.langs.post')}
                </p>
            </section>

            <section className="mx-auto max-w-4xl">
                <h2 className="text-center text-sm font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {t('app.intro.how.title')}
                </h2>
                <div className="mt-6 grid gap-8 sm:grid-cols-4">
                    {howSteps.map((s, i) => (
                        <div key={s.title}>
                            <span className="font-mono text-sm font-semibold text-ochre-500">0{i + 1}</span>
                            <h3 className="mt-2 text-base font-bold text-slate-900">{s.title}</h3>
                            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{s.body}</p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="mx-auto max-w-4xl">
                <h2 className="text-center text-sm font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {t('app.tools.title')}
                </h2>
                <div className="mt-6 grid gap-8 sm:grid-cols-2">
                    <div>
                        <span className="block h-0.5 w-10 rounded-full bg-teal-500" />
                        <h3 className="mt-3 text-base font-bold text-slate-900">{t('app.tools.notebook.title')}</h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t('app.tools.notebook.body')}</p>
                        <p className="mt-2 text-sm leading-relaxed text-slate-500">{t('app.tools.notebook.access')}</p>
                    </div>
                    <div>
                        <span className="block h-0.5 w-10 rounded-full bg-teal-500" />
                        <h3 className="mt-3 text-base font-bold text-slate-900">{t('app.tools.assistant.title')}</h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t('app.tools.assistant.body')}</p>
                        <p className="mt-2 text-sm leading-relaxed text-slate-500">{t('app.tools.assistant.access')}</p>
                    </div>
                    <div>
                        <span className="block h-0.5 w-10 rounded-full bg-teal-500" />
                        <h3 className="mt-3 text-base font-bold text-slate-900">{t('app.tools.readings.title')}</h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t('app.tools.readings.body')}</p>
                        <p className="mt-2 text-sm leading-relaxed text-slate-500">{t('app.tools.readings.access')}</p>
                    </div>
                    <div>
                        <span className="block h-0.5 w-10 rounded-full bg-teal-500" />
                        <h3 className="mt-3 text-base font-bold text-slate-900">{t('app.tools.diagrams.title')}</h3>
                        <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{t('app.tools.diagrams.body')}</p>
                        <p className="mt-2 text-sm leading-relaxed text-slate-500">{t('app.tools.diagrams.access')}</p>
                    </div>
                </div>
            </section>

            <section className="mx-auto max-w-2xl text-center">
                <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-500">
                    {t('app.intro.expect.title')}
                </h2>
                <p className="mt-4 text-base leading-relaxed text-slate-600">
                    {t('app.intro.expect.body')}
                </p>
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
    const router = useRouter();
    const [step, setStep] = useState<Step>('intro');
    const [selectedQuestionnaire, setSelectedQuestionnaire] = useState<QuestionnaireConfig | null>(null);
    const [scores, setScores] = useState<Record<string, number> | null>(null);
    const [sessionId, setSessionId] = useState<string>('');
    const [pdfToken, setPdfToken] = useState<string | undefined>(undefined);
    const [experience, setExperience] = useState<'standard' | 'opencode' | null>(null);
    // Apertura della chat in corso: tiene fermo il comando finché le due
    // scritture non sono andate.
    const [starting, setStarting] = useState(false);
    const [frozenSnapshot, setFrozenSnapshot] = useState<FrozenSessionDetail | null>(null);
    const [savedResults, setSavedResults] = useState<SavedResult[] | null>(null);
    const [notebookUpdatedAt, setNotebookUpdatedAt] = useState<string | null | undefined>(undefined);
    // Schermata iniziale decisa: un link diretto (?frozen, ?start, ...) la
    // rivendica subito, altrimenti si sceglie fra intro e percorso quando i
    // dati dello studente sono arrivati.
    const [ready, setReady] = useState(false);
    // Il taccuino apre soltanto il primo percorso; dopo resta nell'area personale
    // e viene proposto alla conclusione di ogni chat guidata.
    const [notebookReviewed, setNotebookReviewed] = useState(false);
    const [counselorOpenedFromHome, setCounselorOpenedFromHome] = useState(false);
    const entryClaimed = useRef(false);
    // Cronologia del percorso: un'entrata per passo, così Indietro e Avanti del
    // browser (e la gesture di ritorno) si muovono dentro il percorso invece di
    // uscirne. `movingRef` distingue il passo deciso dal codice da quello
    // deciso dal browser, che non deve accodare una nuova entrata.
    const trailRef = useRef<Trail<Step> | null>(null);
    const movingRef = useRef(false);
    const hasCompletedQuestionnaires = (savedResults?.length ?? 0) > 0;

    useEffect(() => {
        getIdentity().then(setIdentity);
    }, []);

    useEffect(() => {
        if (!identity?.authenticated) return;
        let alive = true;
        apiFetch('/api/user/questionnaire-results')
            .then((res) => (res.ok ? res.json() : []))
            .then((rows: unknown) => { if (alive) setSavedResults(Array.isArray(rows) ? (rows as SavedResult[]) : []); })
            .catch(() => { if (alive) setSavedResults([]); });
        apiFetch('/api/user/learner-profile')
            .then((res) => (res.ok ? res.json() : null))
            .then((rev: { created_at?: string } | null) => { if (alive) setNotebookUpdatedAt(rev?.created_at ?? null); })
            .catch(() => { if (alive) setNotebookUpdatedAt(null); });
        return () => { alive = false; };
    }, [identity]);

    // Un'entrata di cronologia per ogni passo, dal secondo in poi: la prima è
    // quella con cui la pagina è stata aperta e va lasciata al browser.
    useEffect(() => {
        if (!ready) return;
        if (movingRef.current) {
            movingRef.current = false;
            return;
        }
        const previous = trailRef.current;
        if (!previous) {
            trailRef.current = startTrail(step);
            return;
        }
        const next = enterStep(previous, step);
        if (next === previous) return;
        trailRef.current = next;
        window.history.pushState({ cbDepth: next.depth }, '');
    }, [ready, step]);

    useEffect(() => {
        const onPopState = (event: PopStateEvent) => {
            const trail = trailRef.current;
            if (!trail) return;
            const depth = (event.state as { cbDepth?: number } | null)?.cbDepth ?? 1;
            const moved = stepAtDepth(trail, depth);
            if (!moved.step) return;
            trailRef.current = moved.trail;
            movingRef.current = true;
            setStep(moved.step);
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

    // Sull'intro nessuno strumento è ancora in corso: il chip nell'header non
    // deve mostrarne uno rimasto da un percorso precedente. Il counselor invece
    // resta scelto: è la preferenza che evita di ripetere la fase ogni volta.
    useEffect(() => {
        if (step === 'intro' || step === 'base') {
            setSelectedInstrumentId(null);
        }
    }, [step]);

    // Un link diretto porta già dove deve: la scelta fra presentazione e
    // percorso non deve sovrascriverlo.
    const claimEntry = () => {
        entryClaimed.current = true;
        setReady(true);
    };

    // Il tasto della presentazione. Il primo passo del percorso è la Bussola,
    // non uno strumento: chi la deve ancora fare ci va da qui, invece di
    // scoprirla come un rimbalzo del cancello alla prima pagina che apre.
    // Lo stato lo si chiede al momento del clic: chiederlo al montaggio
    // costerebbe una domanda al server a ogni visita, e serve solo a chi preme.
    const startFromIntro = () => {
        void (async () => {
            try {
                const status = await fetchOrientationStatus();
                if (status.required) {
                    router.push('/bussola');
                    return;
                }
            } catch {
                // Il server non risponde: si prosegue nel percorso, e il
                // cancello rimanderà alla Bussola se serve davvero.
            }
            setStep(hasCompletedQuestionnaires ? 'questionnaire-select' : 'notebook');
        })();
    };

    // Dove si torna a percorso finito: al percorso se c'è una storia, alla
    // presentazione se è la prima volta.
    const homeStep = (): Step => (
        hasCompletedQuestionnaires || notebookUpdatedAt ? 'base' : 'intro'
    );

    useEffect(() => {
        if (identity === undefined || !identity?.authenticated) return;

        const params = new URLSearchParams(window.location.search);

        // Ripresa di una sessione congelata: lo stato arriva dal server, non da localStorage.
        const frozenParam = params.get('frozen');
        if (frozenParam) {
            entryClaimed.current = true;
            window.history.replaceState(null, '', window.location.pathname);
            void (async () => {
                const snapshot = await getFrozenSession(frozenParam);
                if (!snapshot) {
                    toast.error(t('toast.error'));
                    setReady(true);
                    return;
                }
                const q = QUESTIONNAIRES[snapshot.questionnaire_type as QuestionnaireType];
                if (!q) { setReady(true); return; }
                setSelectedQuestionnaire(q);
                setSelectedInstrumentId(snapshot.questionnaire_type);
                if (snapshot.counselor_id != null) setSelectedCounselorId(snapshot.counselor_id);
                setSessionId(snapshot.session_id);
                setScores(snapshot.scores || {});
                // La sandbox OpenCode si congela come la chat guidata: riaprirla
                // in modalità guidata mostrerebbe un percorso che non è il suo.
                setExperience(snapshot.experience === 'opencode' ? 'opencode' : 'standard');
                // La sandbox rigenera `documento.md` a ogni apertura: senza il
                // token il PDF del profilo sparirebbe dal workspace.
                setPdfToken(snapshot.pdf_token || undefined);
                setFrozenSnapshot(snapshot);
                setStep('interaction');
                setReady(true);
            })();
            return;
        }

        // Riprendi la sessione interrotta (pulsante header): torna dritto alla chat.
        if (params.get('resume')) {
            const r = getResume();
            window.history.replaceState(null, '', window.location.pathname);
            if (r && QUESTIONNAIRES[r.instrument as QuestionnaireType]) {
                const q = QUESTIONNAIRES[r.instrument as QuestionnaireType];
                const profiles = getCompletedProfiles();
                const profile = profiles.find((p) => p.sessionId === r.sessionId)
                    ?? profiles.find((p) => p.questionnaireType === r.instrument);
                // Restore the persisted external session when entering the page.
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setSelectedQuestionnaire(q);
                setSelectedInstrumentId(r.instrument);
                if (r.counselorId != null) setSelectedCounselorId(r.counselorId);
                setSessionId(r.sessionId);
                setScores(profile?.scores && Object.keys(profile.scores).length ? profile.scores : {});
                setExperience(r.experience);
                setStep('interaction');
                claimEntry();
                return;
            }
        }

        if (params.get('view') === 'questionnaires') {
            setSelectedQuestionnaire(null);
            setScores(null);
            setPdfToken(undefined);
            setSessionId('');
            setExperience(null);
            setStep('questionnaire-select');
            window.history.replaceState(null, '', window.location.pathname);
            claimEntry();
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
            setExperience(null);
            setStep('counselor-select');
            window.history.replaceState(null, '', window.location.pathname);
            claimEntry();
            return;
        }

        const requestedId = params.get('start');
        if (!requestedId || !isStartableQuestionnaireId(requestedId)) return;

        const questionnaire = QUESTIONNAIRES[requestedId];
        setSelectedQuestionnaire(questionnaire);
        setSelectedInstrumentId(questionnaire.id);
        setScores(null);
        setPdfToken(undefined);
        setSessionId('');
        setExperience(null);
        setStep('counselor-select');
        window.history.replaceState(null, '', window.location.pathname);
        claimEntry();
    }, [identity]);

    // Nessun link diretto: chi ha già un percorso alle spalle entra dal
    // percorso, chi arriva per la prima volta dalla presentazione.
    useEffect(() => {
        if (ready || entryClaimed.current) return;
        if (!identity?.authenticated) return;
        if (savedResults === null || notebookUpdatedAt === undefined) return;
        // Choose the entry screen after the external profile requests resolve.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStep(savedResults.length > 0 || notebookUpdatedAt ? 'base' : 'intro');
        setReady(true);
    }, [ready, identity, savedResults, notebookUpdatedAt]);

    const startAgentOnlyQuestionnaire = async (questionnaire: QuestionnaireConfig) => {
        const existingSessionId = sessionId;
        const newSessionId = existingSessionId || generateUUID();
        setSessionId(newSessionId);
        setScores({});

        if (!existingSessionId) {
            addCompletedProfile(questionnaire.id, newSessionId, {});
            try {
                const response = await apiFetch('/api/questionnaire-result', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        session_id: newSessionId,
                        questionnaire_type: questionnaire.id,
                        scores: {},
                    }),
                });
                if (response.ok) {
                    const saved = await response.json() as SavedResult;
                    setSavedResults((current) => [...(current ?? []), saved]);
                }
            } catch (e) {
                console.error("Failed to save questionnaire result", e);
            }
        }

        beginInteraction(newSessionId, questionnaire.id);
    };

    // Apre la chat con la modalità già scelta in passato; Idea fa eccezione,
    // perché mappa grafica e OpenCode devono restare una scelta esplicita.
    const beginInteraction = (sid: string, instrument: string) => {
        const pref = experiencePrefForInstrument(instrument, getExperiencePref());
        setExperience(pref);
        if (pref) setResume({ instrument, sessionId: sid, experience: pref, counselorId: getSelectedCounselorId() });
        setStep('interaction');
    };

    // Avvio di uno strumento, dal selettore o dalla schermata del percorso. Il
    // taccuino precede soltanto il primo strumento: chi ha già una compilazione
    // salvata entra direttamente nel percorso e lo ritrova alla fine della chat.
    const handleQuestionnaireSelect = (questionnaire: QuestionnaireConfig) => {
        setCounselorOpenedFromHome(false);
        setSelectedQuestionnaire(questionnaire);
        setSelectedInstrumentId(questionnaire.id);
        setScores(null);
        setPdfToken(undefined);
        setSessionId('');
        setExperience(null);
        if (shouldReviewNotebookBeforeInstrument(hasCompletedQuestionnaires, notebookReviewed)) {
            setStep('notebook');
            return;
        }
        // Counselor già scelto in passato: la fase resta nella catena (ci si
        // torna con "indietro"), ma non la si ripete a ogni strumento.
        if (getSelectedCounselorId() != null) {
            void proceedAfterCounselor(questionnaire, null);
            return;
        }
        setStep('counselor-select');
    };

    const continueAfterNotebook = () => {
        setNotebookReviewed(true);
        if (!selectedQuestionnaire) {
            setStep('questionnaire-select');
            return;
        }
        if (getSelectedCounselorId() != null) {
            void proceedAfterCounselor(selectedQuestionnaire, scores);
            return;
        }
        setStep('counselor-select');
    };

    // Passo successivo alla scelta del counselor. Prende lo strumento come
    // argomento perché viene chiamata anche subito dopo averlo selezionato,
    // quando lo stato non è ancora aggiornato.
    const proceedAfterCounselor = async (questionnaire: QuestionnaireConfig | null, currentScores: Record<string, number> | null) => {
        if (!questionnaire) {
            setStep('questionnaire-select');
            return;
        }
        if (isAgentOnly(questionnaire)) {
            await startAgentOnlyQuestionnaire(questionnaire);
            return;
        }
        if (currentScores !== null) {
            setStep('dashboard');
            return;
        }
        // Il metodo ricordato vale solo quando non c'è nulla da riusare: con
        // compilazioni salvate la scelta "riprendi un profilo" vive solo lì.
        const method = getInputMethodPref();
        const hasSaved = savedResults?.some((r) => r.questionnaire_type === questionnaire.id) ?? true;
        const usable = method === 'upload' ? supportsProfileUpload(questionnaire.id) : method === 'manual';
        if (method && usable && !hasSaved) {
            setStep(method === 'manual' ? 'manual-input' : 'upload-input');
            return;
        }
        setStep('method-select');
    };

    const handleMethodSelect = (method: 'manual' | 'upload' | 'resume', resumeData?: { sessionId: string; scores: Record<string, number> }) => {
        if (method === 'resume') {
            if (!resumeData) return;
            setScores(resumeData.scores);
            setSessionId(resumeData.sessionId);
            setStep('dashboard');
            return;
        }
        setInputMethodPref(method);
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

    // Due POST prima di aprire la chat, e nessun blocco sul comando: un secondo
    // click su rete lenta creava una seconda sessione e una seconda riga di
    // risultato.
    const startInteraction = async () => {
        if (starting) return;
        if (!getSelectedCounselorId()) {
            toast.info(t('counselor.selectFirst'));
            setStep('counselor-select');
            return;
        }
        setStarting(true);
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
            const response = await apiFetch('/api/questionnaire-result', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: newSessionId,
                    questionnaire_type: qType,
                    scores: scores,
                }),
            });
            if (response.ok) {
                const saved = await response.json() as SavedResult;
                setSavedResults((current) => [...(current ?? []), saved]);
            }
        } catch (e) {
            console.error("Failed to save questionnaire result", e);
        }

        setStarting(false);
        beginInteraction(newSessionId, qType);
    };

    // Scelta modalità chat: apre la chat, la ricorda per i prossimi strumenti e
    // registra il punto di ripresa (header "Riprendi").
    const chooseExperience = (exp: 'standard' | 'opencode') => {
        setExperience(exp);
        setExperiencePref(exp);
        if (selectedQuestionnaire) {
            setResume({ instrument: selectedQuestionnaire.id, sessionId, experience: exp, counselorId: getSelectedCounselorId() });
        }
    };

    const handleInteractionComplete = () => {
        setResume(null);
        if (sessionId) void deleteFrozenSession(sessionId);
        setFrozenSnapshot(null);
        setStep('completed');
    };

    const analyzeAnother = () => {
        setResume(null);
        setScores(null);
        setSelectedQuestionnaire(null);
        setPdfToken(undefined);
        setExperience(null);
        setNotebookReviewed(false);
        setStep(homeStep());
    };

    // Indietro sullo schermo e Indietro del browser sono lo stesso gesto: con un
    // passo alle spalle si torna per la cronologia, così le due strade non
    // divergono. Restano da mappare solo gli ingressi diretti (?start=,
    // ?frozen=, ?session_id=), che alle spalle non hanno nulla.
    const goBack = () => {
        const trail = trailRef.current;
        if (trail && trail.depth > 1) {
            window.history.back();
            return;
        }
        if (step === 'notebook') setStep(homeStep());
        else if (step === 'questionnaire-select') setStep(hasCompletedQuestionnaires ? homeStep() : 'notebook');
        else if (step === 'counselor-select' && counselorOpenedFromHome) {
            setCounselorOpenedFromHome(false);
            setStep(homeStep());
        }
        else if (step === 'counselor-select') setStep(selectedQuestionnaire ? 'questionnaire-select' : homeStep());
        else if (step === 'method-select') setStep('counselor-select');
        else if (step === 'manual-input' || step === 'upload-input') setStep('method-select');
        else if (step === 'dashboard') setStep('method-select');
        else if (step === 'interaction') setStep(isAgentOnly(selectedQuestionnaire) ? 'counselor-select' : 'dashboard');
        else if (step === 'completed') setStep('dashboard');
        else if (step === 'farewell') setStep('completed');
    };

    if (identity === undefined) {
        return (
            <div className="page-narrow">
                <div className="glass-panel p-8 text-center text-sm text-slate-500">
                    {t('home.auth.loading')}
                </div>
            </div>
        );
    }

    if (!identity?.authenticated) {
        return (
            <div className="page-narrow">
                <div className="glass-panel p-8 text-center space-y-5">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">{t('home.auth.title')}</h1>
                        <p className="mt-2 text-sm leading-relaxed text-slate-600">
                            {t('home.auth.body')}
                        </p>
                    </div>
                    <a
                        href={ai4authLoginUrl('/')}
                        className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                        <LogIn className="h-4 w-4" />
                        {t('home.auth.cta')}
                    </a>
                </div>
            </div>
        );
    }

    if (!ready) {
        return (
            <div className="page-narrow">
                <div className="glass-panel p-8 text-center text-sm text-slate-500">
                    {t('home.auth.loading')}
                </div>
            </div>
        );
    }

    // Ultima compilazione per strumento: alimenta lo stato nella schermata
    // percorso e il badge nel selettore.
    const lastCompiledAt = (savedResults ?? []).reduce<Partial<Record<QuestionnaireType, string>>>((acc, row) => {
        const type = row.questionnaire_type as QuestionnaireType;
        if (!QUESTIONNAIRES[type]) return acc;
        const current = acc[type];
        if (!current || new Date(row.submitted_at).getTime() > new Date(current).getTime()) {
            acc[type] = row.submitted_at;
        }
        return acc;
    }, {});
    const completedTypes = Object.keys(lastCompiledAt) as QuestionnaireType[];

    // Il taccuino compare nell'orientamento soltanto finché serve come intake.
    const flowStages = hasCompletedQuestionnaires
        ? ['CounselorBot', t('flow.select'), t('flow.counselor'), t('flow.input'), t('flow.profile'), t('flow.chat'), t('flow.done')]
        : ['CounselorBot', t('flow.taccuino'), t('flow.select'), t('flow.counselor'), t('flow.input'), t('flow.profile'), t('flow.chat'), t('flow.done')];
    const stageOffset = hasCompletedQuestionnaires ? 0 : 1;
    const stageIndex =
        step === 'intro' ? 0
            : step === 'notebook' ? 1
                : step === 'questionnaire-select' ? 1 + stageOffset
                    : step === 'counselor-select' ? 2 + stageOffset
                        : step === 'method-select' || step === 'manual-input' || step === 'upload-input' ? 3 + stageOffset
                            : step === 'dashboard' ? 4 + stageOffset
                                : step === 'interaction' ? 5 + stageOffset
                                    : 6 + stageOffset;

    return (
        <div className={cn("page-wide", step === 'interaction' ? "space-y-4" : "space-y-8")}>
            {step !== 'intro' && step !== 'base' && step !== 'interaction' && !(step === 'counselor-select' && counselorOpenedFromHome) && (
                <FlowStepper steps={flowStages} current={stageIndex} />
            )}

            {/* Ogni passo porta la propria testata: il titolo sta nella schermata
                (o nella card), e la "prima riga" di comandi — BackButton più
                ForwardButton — è dentro il componente della fase. */}
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
                        <IntroScreen onStart={startFromIntro} />
                    )}

                    {/* Step: percorso — schermata iniziale di chi è già passato di qui */}
                    {step === 'base' && (
                        <ReturningHome
                            lastCompiledAt={lastCompiledAt}
                            onStartInstrument={handleQuestionnaireSelect}
                            onChangeCounselor={() => {
                                setSelectedQuestionnaire(null);
                                setCounselorOpenedFromHome(true);
                                setStep('counselor-select');
                            }}
                            onOpenIntro={() => setStep('intro')}
                        />
                    )}

                    {/* Step: Taccuino — intake prima del primo strumento. */}
                    {step === 'notebook' && (
                        <div className="space-y-4">
                            <LearnerProfileCard
                                variant="review"
                                requireInitial
                                onDone={continueAfterNotebook}
                                onUnavailable={continueAfterNotebook}
                                onBack={goBack}
                            />
                        </div>
                    )}

                    {/* Step: Counselor Selection */}
                    {step === 'counselor-select' && (
                        <CounselorSelector
                            questionnaireName={selectedQuestionnaire?.name}
                            questionnaireType={selectedQuestionnaire?.id}
                            onBack={goBack}
                            onContinue={counselorOpenedFromHome ? undefined : () => {
                                void proceedAfterCounselor(selectedQuestionnaire, scores);
                            }}
                        />
                    )}

                    {/* Step: Questionnaire Selection */}
                    {step === 'questionnaire-select' && (
                        <QuestionnaireSelector onSelect={handleQuestionnaireSelect} onBack={goBack} completed={completedTypes} />
                    )}

                    {/* Step: Input Method Selection */}
                    {step === 'method-select' && selectedQuestionnaire && (
                        <InputMethodSelector
                            onSelect={handleMethodSelect}
                            onBack={goBack}
                            questionnaire={selectedQuestionnaire}
                        />
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
                                <ForwardButton onClick={startInteraction} label={t('dashboard.ready.btn')} disabled={starting} />
                            </div>
                            <ProfileVisualization scores={scores} questionnaire={selectedQuestionnaire} />
                        </div>
                    )}

                    {/* Step: Guided Chat Interaction */}
                    {step === 'interaction' && scores && selectedQuestionnaire && (
                        <div className="space-y-3">
                            {experience !== 'standard' && <BackButton onClick={goBack} label={t('nav.back')} />}
                            {experience === null ? (
                                /* Scelta modalità, compatta (tasti piccoli, affiancati). */
                                <div className="max-w-md mx-auto">
                                    <div className="glass-panel p-6 text-center space-y-4">
                                        <div>
                                            <h3 className="text-base font-semibold text-slate-800">{t('experience.choose.title')}</h3>
                                            <p className="text-sm text-slate-500 mt-1">{t('experience.choose.sub')}</p>
                                        </div>
                                        <div className="grid sm:grid-cols-2 gap-2.5">
                                            <Button onClick={() => chooseExperience('standard')} className="w-full">
                                                <MessageSquare className="w-4 h-4" />
                                                {t('guided.mode.guided')}
                                            </Button>
                                            <Button variant="secondary" onClick={() => chooseExperience('opencode')} className="w-full">
                                                <Terminal className="w-4 h-4" />
                                                {t('guided.mode.sandbox')}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ) : experience === 'standard' ? (
                                /* Schermata 3: chat (modalità già scelta, nessun toggle in alto). */
                                <ChatViewport>
                                <GuidedChatInterface
                                    onBack={goBack}
                                    scores={scores}
                                    questionnaireType={selectedQuestionnaire.id}
                                    onComplete={handleInteractionComplete}
                                    sessionId={sessionId}
                                    locale={lang}
                                    frozenSnapshot={frozenSnapshot}
                                    onFrozen={() => {
                                        setResume(null);
                                        setFrozenSnapshot(null);
                                        setStep('questionnaire-select');
                                    }}
                                />
                                </ChatViewport>
                            ) : (
                                <ChatViewport>
                                <OpenCodeExperience
                                    scores={scores}
                                    questionnaire={selectedQuestionnaire}
                                    pdfToken={pdfToken}
                                    sessionId={sessionId}
                                    locale={lang}
                                    onComplete={handleInteractionComplete}
                                    restoredMessages={
                                        frozenSnapshot?.session_id === sessionId
                                            ? frozenSnapshot.messages
                                            : undefined
                                    }
                                />
                                </ChatViewport>
                            )}
                        </div>
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

                                <SessionReport sessionId={sessionId} questionnaireType={selectedQuestionnaire?.id || 'QSA'} />
                                <div className="grid grid-cols-1 gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2">
                                    <Button variant="secondary" size="lg" onClick={analyzeAnother}>
                                        {t('completed.another')}
                                    </Button>
                                    <Button variant="secondary" size="lg" onClick={() => setStep('farewell')}>
                                        {t('completed.end')}
                                    </Button>
                                </div>
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
                                        className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-ochre-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-ochre-700"
                                    >
                                        {t('farewell.feedback')}
                                    </a>
                                    <Button variant="secondary" size="lg" onClick={() => setStep(homeStep())} className="w-full">
                                        {t('farewell.home')}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
