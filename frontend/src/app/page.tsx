'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
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
import { ChatSettingsCard } from '@/components/qsa/ChatSettingsCard';
import { SessionReport } from '@/components/qsa/SessionReport';
import { ReturningHome } from '@/components/home/ReturningHome';
import dynamic from 'next/dynamic';

const OpenCodeExperience = dynamic(
    () => import('@/components/qsa/OpenCodeExperience').then((mod) => mod.OpenCodeExperience),
    { ssr: false }
);
import { MessageSquare, Terminal, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { FlowStepper } from '@/components/ui/FlowStepper';
import { IntroScreen } from '@/components/home/IntroScreen';
import { toast } from '@/components/ui/Toast';
import { useI18n } from '@/lib/i18n-context';
import { addCompletedProfile, getCompletedProfiles } from '@/lib/profile-tracker';
import { apiFetch, ai4authLoginUrl, getIdentity, type Identity } from '@/lib/auth';
import { fetchCounselors, getSelectedCounselorId, setSelectedCounselorId, setActiveSessionCounselorId } from '@/lib/counselor';
import { experiencePrefForInstrument, getExperiencePref, getInputMethodPref, getReasoningPref, getResponseLengthPref, setExperiencePref, setInputMethodPref, setReasoningPref, setResponseLengthPref } from '@/lib/session-prefs';
import type { ResponseFormat } from '@/lib/chat-preferences';
import { setSelectedInstrumentId } from '@/lib/instrument';
import { getResume, setResume } from '@/lib/resume';
import { deleteFrozenSession, getFrozenSession, type FrozenSessionDetail } from '@/lib/frozen-session';
import { BackButton } from '@/components/ui/BackButton';
import { ForwardButton } from '@/components/ui/ForwardButton';
import { ResponseLengthSelector, type ResponseLength } from '@/components/ui/ResponseLengthSelector';
import { ReasoningSelector, type ReasoningEffort } from '@/components/ui/ReasoningSelector';
import { fetchAccountPreferences, saveAccountPreferences } from '@/lib/account-preferences';
import { isStartableQuestionnaireId } from '@/lib/tool-catalog';
import { enterStep, startTrail, stepAtDepth, type Trail } from '@/lib/flow-history';


type Step = 'intro' | 'base' | 'questionnaire-select' | 'counselor-select' | 'method-select' | 'manual-input' | 'upload-input' | 'dashboard' | 'chat-settings' | 'interaction' | 'completed' | 'farewell';

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

export default function Home() {
    const { t, lang } = useI18n();
    const [identity, setIdentity] = useState<Identity | null | undefined>(undefined);
    const router = useRouter();
    const [step, setStep] = useState<Step>('intro');
    const [toolsAnchor, setToolsAnchor] = useState<string | null>(null);

    // Il catalogo strumenti (step 'base') viene aperto anche dalla presentazione:
    // se è richiesta una sezione specifica, scorri all'anchor dopo il render.
    const openTools = (anchor?: string) => {
        setStep('base');
        setToolsAnchor(anchor ?? null);
    };
    useEffect(() => {
        if (step !== 'base' || !toolsAnchor) return;
        const timer = window.setTimeout(() => {
            document.getElementById(toolsAnchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setToolsAnchor(null);
        }, 60);
        return () => window.clearTimeout(timer);
    }, [step, toolsAnchor]);
    const [selectedQuestionnaire, setSelectedQuestionnaire] = useState<QuestionnaireConfig | null>(null);
    const [counselorRequest, setCounselorRequest] = useState<{
        questionnaire: QuestionnaireConfig; scores: Record<string, number> | null; resumeSid?: string; previousId: number | null;
    } | null>(null);
    const [scores, setScores] = useState<Record<string, number> | null>(null);
    const [sessionId, setSessionId] = useState<string>('');
    const [pdfToken, setPdfToken] = useState<string | undefined>(undefined);
    const [experience, setExperience] = useState<'standard' | 'opencode' | null>(null);
    const [responseLength, setResponseLength] = useState<ResponseLength>(() => getResponseLengthPref());
    const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(() => getReasoningPref());
    // Formato delle risposte: scelto nella pagina Impostazioni e consegnato
    // alla chat come valore iniziale; in chat resta regolabile dal menu.
    const [responseFormat, setResponseFormat] = useState<ResponseFormat>('standard');
    // Il selettore del ragionamento non farebbe nulla sui modelli noti come
    // non-reasoning: si chiede al server se quello del counselor ragiona.
    const [reasoningCapable, setReasoningCapable] = useState(true);
    // Apertura della chat in corso: tiene fermo il comando finché le due
    // scritture non sono andate.
    const [starting, setStarting] = useState(false);
    const [preparingInstrument, setPreparingInstrument] = useState(false);
    const [sessionCounselorId, setSessionCounselorId] = useState<number | null>(null);
    const [frozenSnapshot, setFrozenSnapshot] = useState<FrozenSessionDetail | null>(null);
    const [savedResults, setSavedResults] = useState<SavedResult[] | null>(null);
    const [notebookUpdatedAt, setNotebookUpdatedAt] = useState<string | null | undefined>(undefined);
    // Schermata iniziale decisa: un link diretto (?frozen, ?start, ...) la
    // rivendica subito, altrimenti si sceglie fra intro e percorso quando i
    // dati dello studente sono arrivati.
    const [ready, setReady] = useState(false);
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
        if (!ready || preparingInstrument) return;
        if (movingRef.current) {
            movingRef.current = false;
            return;
        }
        const previous = trailRef.current;
        if (!previous) {
            trailRef.current = startTrail(step);
            window.history.replaceState({ ...window.history.state, cbPageStep: step, cbDepth: 1 }, '');
            return;
        }
        const next = enterStep(previous, step);
        if (next === previous) return;
        trailRef.current = next;
        window.history.pushState({ ...window.history.state, cbDepth: next.depth, cbPageStep: step }, '');
    }, [ready, step, preparingInstrument]);

    useEffect(() => {
        const onPopState = (event: PopStateEvent) => {
            const trail = trailRef.current;
            if (!trail) return;
            const depth = (event.state as { cbDepth?: number } | null)?.cbDepth ?? 1;
            const moved = stepAtDepth(trail, depth);
            if (!moved.step || moved.trail.depth === trail.depth) return;
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
    const claimEntry = useCallback(() => {
        entryClaimed.current = true;
        setReady(true);
    }, []);

    // Il tasto della presentazione. Il primo passo del percorso è la Bussola,
    // non uno strumento: la scheda apre sempre la chat di orientamento, anche
    // per chi l'ha già completata (dove resta disponibile come colloquio).
    // Lo stato lo si chiede al momento del clic: chiederlo al montaggio
    // costerebbe una domanda al server a ogni visita, e serve solo a chi preme.
    const startFromIntro = () => {
        void (async () => {
            try {
                const prefs = await fetchAccountPreferences();
                if (!prefs.counselor_ready || !prefs.notebook_ready) {
                    router.push('/inizia?next=%2Fbussola');
                    return;
                }
                router.push('/bussola');
            } catch {
                toast.error(t('setup.error'));
                return;
            }
        })();
    };

    // Dove si torna a percorso finito: al percorso se c'è una storia, alla
    // presentazione se è la prima volta.
    const homeStep = (): Step => (
        hasCompletedQuestionnaires || notebookUpdatedAt ? 'base' : 'intro'
    );

    // Nessun link diretto: la presentazione iniziale è l'unica landing page
    // per tutti gli accessi; la schermata strumenti non viene più usata come
    // porta d'ingresso automatica per i secondi utilizzi.
    useEffect(() => {
        if (ready || entryClaimed.current) return;
        if (!identity?.authenticated) return;
        if (savedResults === null || notebookUpdatedAt === undefined) return;
        setStep('intro');
        setReady(true);
    }, [ready, identity, savedResults, notebookUpdatedAt]);

    // Apre la chat con la modalità già scelta in passato; Idea fa eccezione,
    // perché mappa grafica e OpenCode devono restare una scelta esplicita.
    const beginInteraction = useCallback((sid: string, instrument: string) => {
        setSessionCounselorId(getSelectedCounselorId());
        const pref = experiencePrefForInstrument(instrument, getExperiencePref());
        setExperience(pref);
        if (pref) setResume({ instrument, sessionId: sid, experience: pref, counselorId: getSelectedCounselorId() });
        setStep('interaction');
    }, []);

    const startAgentOnlyQuestionnaire = useCallback(async (questionnaire: QuestionnaireConfig, resumeSid?: string) => {
        const existingSessionId = resumeSid || '';
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
    }, [beginInteraction]);

    // Verifica il counselor per questo strumento prima di avviare il percorso.
    const prepareInstrument = useCallback(async (questionnaire: QuestionnaireConfig | null, currentScores: Record<string, number> | null, resumeSid?: string) => {
        if (!questionnaire) {
            setStep('questionnaire-select');
            return;
        }
        setPreparingInstrument(true);
        try {
            const preferences = await fetchAccountPreferences().catch(() => null);
            if (!preferences) { toast.error(t('setup.error')); return; }
            if (!preferences.notebook_ready || !preferences.counselor_ready) {
                router.push(`${preferences.notebook_ready ? "/counselor" : "/inizia"}?next=${encodeURIComponent(`/?start=${questionnaire.id}`)}`);
                return;
            }
            const counselors = await fetchCounselors(lang, lang, questionnaire.id);
            const counselor = counselors.find(row => row.id === preferences.counselor_id);
            if (!counselor || counselor.is_active === false || counselor.suitable === false) {
                setCounselorRequest({ questionnaire, scores: currentScores, resumeSid, previousId: preferences.counselor_id });
                setStep('counselor-select');
                return;
            }
            setSelectedCounselorId(counselor.id);
            if (isAgentOnly(questionnaire)) {
                await startAgentOnlyQuestionnaire(questionnaire, resumeSid);
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
        } finally { setPreparingInstrument(false); }
    }, [lang, router, savedResults, startAgentOnlyQuestionnaire, t]);

    useEffect(() => {
        if (entryClaimed.current || !identity?.authenticated) return;

        const params = new URLSearchParams(window.location.search);

        // Ripresa di una sessione congelata: lo stato arriva dal server, non da localStorage.
        const frozenParam = params.get('frozen');
        if (frozenParam) {
            entryClaimed.current = true;
            window.history.replaceState({ ...window.history.state }, '', window.location.pathname);
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
                setSessionCounselorId(snapshot.counselor_id ?? getSelectedCounselorId());
                if (snapshot.counselor_id != null) setSelectedCounselorId(snapshot.counselor_id);
                setSessionId(snapshot.session_id);
                setScores(snapshot.scores || {});
                // La sandbox OpenCode si congela come la chat guidata: riaprirla
                // in modalità guidata mostrerebbe un percorso che non è il suo.
                setExperience(snapshot.experience === 'opencode' ? 'opencode' : 'standard');
                if (snapshot.response_length) setResponseLength(snapshot.response_length);
                if (snapshot.reasoning_effort) setReasoningEffort(snapshot.reasoning_effort);
                // La sandbox rigenera `documento.md` a ogni apertura: senza il
                // token il PDF del profilo sparirebbe dal workspace.
                setPdfToken(snapshot.pdf_token || undefined);
                setFrozenSnapshot(snapshot);
                setStep('interaction');
                setReady(true);
            })().catch(() => { toast.error(t('toast.error')); setReady(true); });
            return;
        }

        // Riprendi la sessione interrotta (pulsante header): torna dritto alla chat.
        if (params.get('resume')) {
            const r = getResume();
            window.history.replaceState({ ...window.history.state }, '', window.location.pathname);
            if (r && QUESTIONNAIRES[r.instrument as QuestionnaireType]) {
                const q = QUESTIONNAIRES[r.instrument as QuestionnaireType];
                const profiles = getCompletedProfiles();
                const profile = profiles.find((p) => p.sessionId === r.sessionId)
                    ?? profiles.find((p) => p.questionnaireType === r.instrument);
                // Restore the persisted external session when entering the page.
                setSelectedQuestionnaire(q);
                setSelectedInstrumentId(r.instrument);
                setSessionCounselorId(r.counselorId ?? getSelectedCounselorId());
                if (r.counselorId != null) setSelectedCounselorId(r.counselorId);
                setSessionId(r.sessionId);
                setScores(profile?.scores && Object.keys(profile.scores).length ? profile.scores : {});
                setExperience(r.experience);
                // Prefer the owned server snapshot: it retains the essential path and format.
                entryClaimed.current = true;
                void getFrozenSession(r.sessionId).then(snapshot => {
                    if (snapshot) {
                        setFrozenSnapshot(snapshot);
                        setScores(snapshot.scores || {});
                        setExperience(snapshot.experience === 'opencode' ? 'opencode' : 'standard');
                        if (snapshot.response_length) setResponseLength(snapshot.response_length);
                        if (snapshot.reasoning_effort) setReasoningEffort(snapshot.reasoning_effort);
                    }
                    setStep('interaction');
                    setReady(true);
                }).catch(() => { toast.error(t('toast.error')); setReady(true); });
                return;
            }
        }

        // `view=home` arriva dal bivio della Bussola: chi sceglie gli strumenti
        // deve trovare il catalogo di chi torna, non la presentazione, anche se
        // è la prima volta e non ha ancora compilato nulla.
        const view = params.get('view') || (!params.get('start') && !params.get('session_id')
            ? ({ 'questionnaire-select': 'questionnaires', base: 'home', intro: 'intro' } as Record<string, string>)[window.history.state?.cbPageStep] : null);
        if (view === 'questionnaires' || view === 'home' || view === 'intro') {
            setSelectedQuestionnaire(null);
            setScores(null);
            setPdfToken(undefined);
            setSessionId('');
            setExperience(null);
            setStep(view === 'intro' ? 'intro' : view === 'home' ? 'base' : 'questionnaire-select');
            window.history.replaceState({ ...window.history.state }, '', window.location.pathname);
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
            void prepareInstrument(questionnaire, profile?.scores ?? {}, resumeSession);
            window.history.replaceState({ ...window.history.state }, '', window.location.pathname);
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
        void prepareInstrument(questionnaire, null);
        window.history.replaceState({ ...window.history.state }, '', window.location.pathname);
        claimEntry();
    }, [identity, prepareInstrument, claimEntry, t]);

    // Tutti gli ingressi riusano le preferenze dell’account.
    const handleQuestionnaireSelect = (questionnaire: QuestionnaireConfig) => {
        setSelectedQuestionnaire(questionnaire);
        setSelectedInstrumentId(questionnaire.id);
        setScores(null);
        setPdfToken(undefined);
        setSessionId('');
        setExperience(null);
        void prepareInstrument(questionnaire, null);
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
            router.push(`/counselor?next=${encodeURIComponent(`/?start=${selectedQuestionnaire?.id || 'QSA'}`)}`);
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

    useEffect(() => {
        if (step !== 'interaction' && step !== 'chat-settings') return;
        // Nella pagina Impostazioni la sessione non è ancora iniziata: il counselor
        // selezionato viene dal pannello di preferenza, non dallo stato.
        const counselorId = sessionCounselorId ?? getSelectedCounselorId();
        if (counselorId == null) return;
        let cancelled = false;
        void fetchCounselors(lang).then((rows) => {
            if (cancelled) return;
            const chosen = rows.find((row) => row.id === counselorId);
            setReasoningCapable(chosen?.reasoning_capable !== false);
        });
        return () => { cancelled = true; };
    }, [step, lang, sessionCounselorId]);

    useEffect(() => {
        setActiveSessionCounselorId(step === 'interaction' ? sessionCounselorId : null);
        return () => setActiveSessionCounselorId(null);
    }, [step, sessionCounselorId]);

    // Lunghezza risposta: scelta nella schermata della modalità e ricordata per
    // i prossimi strumenti; in chat guidata resta comunque regolabile.
    const handleResponseLengthChange = (value: ResponseLength) => {
        setResponseLength(value);
        setResponseLengthPref(value);
    };

    // Spazio di ragionamento: stessa logica della lunghezza. Vale per la chat
    // guidata; la sandbox OpenCode parla con il proprio agente e non lo usa.
    const handleReasoningChange = (value: ReasoningEffort) => {
        setReasoningEffort(value);
        setReasoningPref(value);
    };

    // Scelta modalità chat: apre la chat, la ricorda per i prossimi strumenti e
    // registra il punto di ripresa (header "Riprendi").
    const chooseExperience = (exp: 'standard' | 'opencode') => {
        setExperience(exp);
        setExperiencePref(exp);
        if (selectedQuestionnaire) {
            setResume({ instrument: selectedQuestionnaire.id, sessionId, experience: exp, counselorId: sessionCounselorId });
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
        if (window.history.state?.cbPreviousPage && window.history.length > 1) { router.back(); return; }
        if (step === 'questionnaire-select') setStep(homeStep());
        else if (step === 'method-select' || step === 'counselor-select') setStep('questionnaire-select');
        else if (step === 'manual-input' || step === 'upload-input') setStep('method-select');
        else if (step === 'dashboard') setStep('method-select');
        else if (step === 'chat-settings') setStep('dashboard');
        else if (step === 'interaction') setStep(isAgentOnly(selectedQuestionnaire) ? 'questionnaire-select' : 'dashboard');
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

    if (!ready || preparingInstrument) {
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

    const flowStages = ['CounselorBot', t('flow.select'), t('flow.input'), t('flow.profile'), t('flow.settings'), t('flow.chat'), t('flow.done')];
    const stageIndex = step === 'intro' ? 0
        : step === 'questionnaire-select' || step === 'counselor-select' ? 1
        : step === 'method-select' || step === 'manual-input' || step === 'upload-input' ? 2
        : step === 'dashboard' ? 3 : step === 'chat-settings' ? 4 : step === 'interaction' ? 5 : 6;

    return (
        <div className={cn("page-wide", step === 'interaction' ? "space-y-4" : "space-y-8")}>
            {step !== 'intro' && step !== 'base' && step !== 'interaction' && (
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
                        <IntroScreen onStart={startFromIntro} onOpenTools={openTools} />
                    )}

                    {/* Step: percorso — schermata iniziale di chi è già passato di qui */}
                    {step === 'base' && (
                        <ReturningHome
                            lastCompiledAt={lastCompiledAt}
                            onStartInstrument={handleQuestionnaireSelect}
                            onOpenIntro={() => setStep('intro')}
                        />
                    )}

                    {/* Step: Questionnaire Selection */}
                    {step === 'questionnaire-select' && (
                        <QuestionnaireSelector onSelect={handleQuestionnaireSelect} onBack={goBack} completed={completedTypes} />
                    )}

                    {step === 'counselor-select' && counselorRequest && (
                        <section className="space-y-4">
                            <h1 className="text-2xl font-bold text-slate-900">{t('setup.counselor')}</h1>
                            <p className="text-sm text-slate-600">{t('setup.compatibility', { instrument: counselorRequest.questionnaire.name })}</p>
                            <CounselorSelector questionnaireType={counselorRequest.questionnaire.id}
                                questionnaireName={counselorRequest.questionnaire.name} initialSelectedId={counselorRequest.previousId}
                                busy={starting} onBack={goBack} onContinue={(id) => {
                                    if (starting) return;
                                    setStarting(true);
                                    void saveAccountPreferences(id)
                                        .then(() => prepareInstrument(counselorRequest.questionnaire, counselorRequest.scores, counselorRequest.resumeSid))
                                        .catch(() => toast.error(t('setup.error')))
                                        .finally(() => setStarting(false));
                                }} />
                        </section>
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
                                <ForwardButton onClick={() => setStep('chat-settings')} label={t('dashboard.ready.btn')} disabled={starting} />
                            </div>
                            <ProfileVisualization scores={scores} questionnaire={selectedQuestionnaire} />
                        </div>
                    )}

                    {/* Step: Impostazioni conversazione. Una pagina sola, prima di
                        entrare in chat; chi riprende una sessione congelata la
                        salta, perché la sua conversazione ha già le sue regole. */}
                    {step === 'chat-settings' && scores && selectedQuestionnaire && (
                        <ChatSettingsCard
                            reasoningCapable={reasoningCapable}
                            starting={starting}
                            responseFormat={responseFormat}
                            onResponseFormatChange={setResponseFormat}
                            responseLength={responseLength}
                            onResponseLengthChange={handleResponseLengthChange}
                            reasoningEffort={reasoningEffort}
                            onReasoningChange={handleReasoningChange}
                            onBack={goBack}
                            onStart={startInteraction}
                        />
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
                                        <div className="mt-4 flex flex-col items-center gap-1.5">
                                            <p className="text-xs font-semibold text-slate-500">{t('responseLength.label')}</p>
                                            <ResponseLengthSelector value={responseLength} onChange={handleResponseLengthChange} />
                                            {reasoningCapable && <>
                                                <p className="mt-2 text-xs font-semibold text-slate-500">{t('reasoning.label')}</p>
                                                <ReasoningSelector value={reasoningEffort} onChange={handleReasoningChange} />
                                            </>}
                                        </div>
                                    </div>
                                </div>
                            ) : experience === 'standard' ? (
                                /* Schermata 3: chat (modalità già scelta, nessun toggle in alto). */
                                <ChatViewport>
                                <GuidedChatInterface
                                    counselorId={sessionCounselorId}
                                    onBack={goBack}
                                    scores={scores}
                                    questionnaireType={selectedQuestionnaire.id}
                                    onComplete={handleInteractionComplete}
                                    sessionId={sessionId}
                                    locale={lang}
                                    frozenSnapshot={frozenSnapshot}
                                    initialResponseLength={responseLength}
                                    initialReasoningEffort={reasoningEffort}
                                    initialResponseFormat={responseFormat}
                                    reasoningCapable={reasoningCapable}
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
                                    counselorId={sessionCounselorId}
                                    scores={scores}
                                    questionnaire={selectedQuestionnaire}
                                    pdfToken={pdfToken}
                                    sessionId={sessionId}
                                    locale={lang}
                                    onComplete={handleInteractionComplete}
                                    initialResponseFormat={frozenSnapshot?.response_format}
                                    responseLength={responseLength}
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
