'use client';

import { Send, Bot, ChevronRight, CheckCircle2, Loader2, BarChart3, Volume2, Square, Home } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { QSAFactorCode, QSA_FACTORS, analyzeScore } from '@/lib/qsa-model';
import { ZTPIFactorCode, ZTPI_FACTORS, analyzeZTPIScore, getZTPIAlignmentColorClass } from '@/lib/ztpi-model';
import { QUESTIONNAIRES } from '@/lib/questionnaires';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useRouter } from 'next/navigation';

// --- Types ---

interface StepDef {
    id: string;
    sort_order: number;
    label: string;
    system_prompt_mode: string;
    color_theme: string;
    prompt?: string;
}

interface GuidedChatInterfaceProps {
    scores: Record<string, number>;
    questionnaireType: string;
    onComplete: () => void;
    sessionId: string;
}

const ZTPI_REQUIRED_STEP_IDS = ['ztpi-t1', 'ztpi-t2', 'ztpi-t3', 'ztpi-t4', 'ztpi-t5', 'ztpi-btp'];
const SAVICKAS_REQUIRED_STEP_IDS = ['savickas-patto', 'savickas-q1', 'savickas-q2', 'savickas-q3', 'savickas-q4', 'savickas-q5', 'savickas-final'];

const ZTPI_FALLBACK_STEPS: StepDef[] = [
    {
        id: 'ztpi-t1',
        sort_order: 1,
        label: '1. Passato Negativo',
        system_prompt_mode: 'ztpi-factor',
        color_theme: 'rose',
        prompt: 'Analizza il fattore Passato Negativo del mio profilo temporale. Nel testo finale evita sigle tecniche.',
    },
    {
        id: 'ztpi-t2',
        sort_order: 2,
        label: '2. Passato Positivo',
        system_prompt_mode: 'ztpi-factor',
        color_theme: 'amber',
        prompt: 'Analizza il fattore Passato Positivo del mio profilo temporale. Nel testo finale evita sigle tecniche.',
    },
    {
        id: 'ztpi-t3',
        sort_order: 3,
        label: '3. Presente Edonistico',
        system_prompt_mode: 'ztpi-factor',
        color_theme: 'orange',
        prompt: "Analizza il fattore Presente Edonistico del mio profilo temporale. Spiega in modo semplice che 'edonistico' significa anche vivere il presente e cogliere l'attimo (carpe diem), con equilibrio e responsabilità. Nel testo finale evita sigle tecniche.",
    },
    {
        id: 'ztpi-t4',
        sort_order: 4,
        label: '4. Presente Fatalistico',
        system_prompt_mode: 'ztpi-factor',
        color_theme: 'red',
        prompt: "Analizza il fattore Presente Fatalistico del mio profilo temporale. Spiega in modo semplice che 'fatalistico' significa percepire poco controllo personale e tendere alla rassegnazione. Nel testo finale evita sigle tecniche.",
    },
    {
        id: 'ztpi-t5',
        sort_order: 5,
        label: '5. Futuro',
        system_prompt_mode: 'ztpi-factor',
        color_theme: 'teal',
        prompt: 'Analizza il fattore Futuro del mio profilo temporale. Nel testo finale evita sigle tecniche.',
    },
    {
        id: 'ztpi-btp',
        sort_order: 6,
        label: '6. Profilo Temporale Equilibrato',
        system_prompt_mode: 'ztpi-btp',
        color_theme: 'purple',
        prompt: "Analisi finale del profilo temporale: confronta il mio profilo complessivo con il profilo temporale equilibrato. Spiega sempre in modo semplice cosa significano 'presente edonistico' (anche vivere il presente e cogliere l'attimo) e 'presente fatalistico'. Nel testo finale evita sigle tecniche.",
    },
];

const SAVICKAS_FALLBACK_STEPS: StepDef[] = [
    {
        id: 'savickas-patto',
        sort_order: 0,
        label: '0. Patto di Collaborazione',
        system_prompt_mode: 'savickas-interview',
        color_theme: 'cyan',
        prompt: "Apri l'intervista Savickas creando un patto con lo studente: obiettivo, metodo, ruoli, riservatezza e conferma esplicita prima di iniziare.",
    },
    {
        id: 'savickas-q1',
        sort_order: 1,
        label: '1. Modelli di Ruolo',
        system_prompt_mode: 'savickas-interview',
        color_theme: 'blue',
        prompt: 'Poni la domanda 1/5 dell’intervista Savickas sui modelli di ruolo (tre figure e qualità ammirate).',
    },
    {
        id: 'savickas-q2',
        sort_order: 2,
        label: '2. Media Preferiti',
        system_prompt_mode: 'savickas-interview',
        color_theme: 'indigo',
        prompt: 'Poni la domanda 2/5 dell’intervista Savickas su riviste/siti/contenuti preferiti e su cosa attira.',
    },
    {
        id: 'savickas-q3',
        sort_order: 3,
        label: '3. Storia Preferita',
        system_prompt_mode: 'savickas-interview',
        color_theme: 'amber',
        prompt: 'Poni la domanda 3/5 dell’intervista Savickas sulla storia preferita (libro/film/serie) e significato personale.',
    },
    {
        id: 'savickas-q4',
        sort_order: 4,
        label: '4. Motto Personale',
        system_prompt_mode: 'savickas-interview',
        color_theme: 'teal',
        prompt: 'Poni la domanda 4/5 dell’intervista Savickas sul motto personale e su come guida le scelte.',
    },
    {
        id: 'savickas-q5',
        sort_order: 5,
        label: '5. Ricordi Precoci',
        system_prompt_mode: 'savickas-interview',
        color_theme: 'rose',
        prompt: 'Poni la domanda 5/5 dell’intervista Savickas su tre ricordi precoci con un titolo breve per ciascuno.',
    },
    {
        id: 'savickas-final',
        sort_order: 6,
        label: "6. Sintesi Narrativa e Piano d'Azione",
        system_prompt_mode: 'savickas-summary',
        color_theme: 'purple',
        prompt: 'Produci la sintesi finale: tema centrale, risorse, ostacoli, ipotesi di direzione e piano 7/30/90 giorni.',
    },
];

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeLoadedSteps(questionnaireType: string, loadedSteps: StepDef[]): StepDef[] {
    const ordered = [...loadedSteps].sort((a, b) => a.sort_order - b.sort_order);
    if (questionnaireType === 'ZTPI') {
        const ids = ordered.map((s) => s.id);
        const hasAllRequired = ZTPI_REQUIRED_STEP_IDS.every((id) => ids.includes(id));
        return hasAllRequired ? ordered : ZTPI_FALLBACK_STEPS;
    }
    if (questionnaireType === 'SAVICKAS') {
        const ids = ordered.map((s) => s.id);
        const hasAllRequired = SAVICKAS_REQUIRED_STEP_IDS.every((id) => ids.includes(id));
        return hasAllRequired ? ordered : SAVICKAS_FALLBACK_STEPS;
    }
    return ordered;
}

// --- Color theme mapping (string literals for Tailwind scanner) ---

const COLOR_THEMES: Record<string, { headerBg: string; iconBg: string }> = {
    blue:   { headerBg: 'bg-blue-50',   iconBg: 'bg-blue-500' },
    purple: { headerBg: 'bg-purple-50', iconBg: 'bg-purple-500' },
    indigo: { headerBg: 'bg-indigo-50', iconBg: 'bg-indigo-500' },
    pink:   { headerBg: 'bg-pink-50',   iconBg: 'bg-pink-500' },
    orange: { headerBg: 'bg-orange-50', iconBg: 'bg-orange-500' },
    teal:   { headerBg: 'bg-teal-50',   iconBg: 'bg-teal-500' },
    green:  { headerBg: 'bg-green-50',  iconBg: 'bg-green-500' },
    red:    { headerBg: 'bg-red-50',    iconBg: 'bg-red-500' },
    amber:  { headerBg: 'bg-amber-50',  iconBg: 'bg-amber-500' },
    cyan:   { headerBg: 'bg-cyan-50',   iconBg: 'bg-cyan-500' },
    slate:  { headerBg: 'bg-slate-50',  iconBg: 'bg-slate-500' },
    rose:   { headerBg: 'bg-rose-50',   iconBg: 'bg-rose-500' },
};

const DEFAULT_COLOR = { headerBg: 'bg-blue-50', iconBg: 'bg-blue-500' };
const QUESTIONS_COLOR = { headerBg: 'bg-green-50', iconBg: 'bg-green-500' };
const CONCLUSION_COLOR = { headerBg: 'bg-slate-50', iconBg: 'bg-slate-500' };

// --- Fixed phases ---

const FIXED_QUESTIONS_ID = 'questions';
const FIXED_CONCLUSION_ID = 'conclusion';
const STEP_ADVANCE_MARKER = '[[AVANZA_STEP]]';

// --- Sidebar section labels per prefix ---

const PREFIX_SIDEBAR: Record<string, { label: string; colorClass: string }> = {
    C: { label: 'Cognitive', colorClass: 'text-blue-600' },
    A: { label: 'Affettive', colorClass: 'text-purple-600' },
    T: { label: 'Prospettiva Temporale', colorClass: 'text-amber-600' },
};

// --- Score formatters per questionnaire type ---

function buildScoresFormatter(questionnaireType: string): (scores: Record<string, number>) => string {
    if (questionnaireType === 'SAVICKAS') {
        return (): string => {
            return 'CONTESTO INTERVISTA SAVICKAS: percorso narrativo qualitativo senza punteggi numerici.';
        };
    }

    if (questionnaireType === 'ZTPI') {
        return (scores: Record<string, number>): string => {
            const parts = Object.entries(scores)
                .filter(([k]) => k.startsWith('T'))
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([code, value]) => `${code}:${value}`)
                .join(' ');
            return `ZTPI ${parts}`;
        };
    }

    // Default: QSA formatter (compact — solo punteggi, il sistema prompt contiene le regole)
    return (scores: Record<string, number>): string => {
        const cog = Object.entries(scores)
            .filter(([k]) => k.startsWith('C'))
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([code, value]) => `${code}:${value}`)
            .join(' ');
        const aff = Object.entries(scores)
            .filter(([k]) => k.startsWith('A'))
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([code, value]) => `${code}:${value}`)
            .join(' ');
        return `QSA C[${cog}] A[${aff}]`;
    };
}

// --- Color helpers for sidebar compact bars ---

function getScoreColor(
    code: string,
    score: number,
    invertedSet: Set<string>,
    questionnaireType: string
): string {
    if (questionnaireType === 'ZTPI' && code.startsWith('T')) {
        return getZTPIAlignmentColorClass(code as ZTPIFactorCode, score);
    }

    const isInverted = invertedSet.has(code);
    if (score <= 3) return isInverted ? 'bg-green-500' : 'bg-red-500';
    if (score <= 6) return 'bg-yellow-500';
    return isInverted ? 'bg-red-500' : 'bg-green-500';
}

function CompactScoreBar({
    code,
    score,
    invertedSet,
    questionnaireType,
}: {
    code: string;
    score: number;
    invertedSet: Set<string>;
    questionnaireType: string;
}) {
    const color = getScoreColor(code, score, invertedSet, questionnaireType);
    const width = (score / 9) * 100;

    return (
        <div className="flex items-center gap-2">
            <span className="w-6 text-[10px] font-mono text-slate-500">{code}</span>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${width}%` }} />
            </div>
            <span className="w-4 text-[10px] font-bold text-slate-600">{score}</span>
        </div>
    );
}

// --- Markdown ---

const markdownComponents: Components = {
    table: ({ node, ...props }) => (
        <table
            className="w-full min-w-[760px] border-separate border-spacing-0 text-sm text-slate-800"
            {...props}
        />
    ),
    thead: ({ node, ...props }) => <thead className="bg-slate-50" {...props} />,
    tbody: ({ node, ...props }) => <tbody className="[&_tr:nth-child(even)]:bg-slate-50/40" {...props} />,
    tr: ({ node, ...props }) => <tr className="border-b border-slate-100" {...props} />,
    th: ({ node, ...props }) => (
        <th
            className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600 border-b border-slate-200"
            {...props}
        />
    ),
    td: ({ node, ...props }) => <td className="px-3 py-2 align-top leading-relaxed border-b border-slate-100" {...props} />,
    p: ({ node, ...props }) => <p className="my-1.5 text-sm leading-relaxed" {...props} />,
    ul: ({ node, ...props }) => <ul className="my-2 pl-5 list-disc space-y-1" {...props} />,
    ol: ({ node, ...props }) => <ol className="my-2 pl-5 list-decimal space-y-1" {...props} />,
    li: ({ node, ...props }) => <li className="leading-relaxed" {...props} />,
    strong: ({ node, ...props }) => <strong className="font-semibold text-slate-900" {...props} />,
};

// --- Main Component ---

export function GuidedChatInterface({ scores, questionnaireType, onComplete, sessionId }: GuidedChatInterfaceProps) {
    const router = useRouter();
    const [steps, setSteps] = useState<StepDef[]>([]);
    const [phases, setPhases] = useState<string[]>([]);
    const [currentPhase, setCurrentPhase] = useState<string>('');
    const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [lastAnalysisFailed, setLastAnalysisFailed] = useState(false);
    const [playingMessageIdx, setPlayingMessageIdx] = useState<number | null>(null);
    const [isAudioLoading, setIsAudioLoading] = useState(false);
    const [showAdvanceSuggestion, setShowAdvanceSuggestion] = useState(false);
    const [userMessagesInPhase, setUserMessagesInPhase] = useState(0);

    // Fixed-phase configurable texts
    const [questionsLabel, setQuestionsLabel] = useState('Domande e Approfondimenti');
    const [conclusionLabel, setConclusionLabel] = useState('Conclusione');
    const [questionsBanner, setQuestionsBanner] = useState('--- Fase Domande e Approfondimenti ---');
    const [questionsIntro, setQuestionsIntro] = useState(
        "Abbiamo completato l'analisi strutturata. Ora puoi farmi qualsiasi domanda libera."
    );
    const [conclusionText, setConclusionText] = useState(
        'Hai completato il percorso di analisi. Clicca sul pulsante in basso per tornare alla Home Page.'
    );

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const lastProcessedPhase = useRef<string | null>(null);

    // Derived from questionnaire config
    const questionnaire = useMemo(() => QUESTIONNAIRES[questionnaireType as keyof typeof QUESTIONNAIRES], [questionnaireType]);
    const invertedSet = useMemo(() => new Set(questionnaire?.invertedFactors || []), [questionnaire]);
    const formatScoresForPrompt = useMemo(() => buildScoresFormatter(questionnaireType), [questionnaireType]);

    // Score groups for sidebar
    const scoreGroups = useMemo(() => {
        if (!questionnaire) return [];
        return questionnaire.factorPrefix.map(prefix => ({
            prefix,
            label: PREFIX_SIDEBAR[prefix]?.label || prefix,
            colorClass: PREFIX_SIDEBAR[prefix]?.colorClass || 'text-slate-600',
            entries: Object.entries(scores)
                .filter(([k]) => k.startsWith(prefix))
                .sort(([a], [b]) => a.localeCompare(b)),
        }));
    }, [scores, questionnaire]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
            }
        };
    }, []);

    // Load step definitions and config texts from backend
    useEffect(() => {
        let isMounted = true;

        const loadData = async () => {
            try {
                const res = await fetch(`/api/qsa/guided-ui-texts?questionnaire_type=${questionnaireType}`);
                if (!res.ok) return;

                const data = await res.json();
                if (!isMounted) return;

                // Dynamic steps
                const loadedSteps: StepDef[] = data.guided_steps || [];
                const normalizedSteps = normalizeLoadedSteps(questionnaireType, loadedSteps);
                setSteps(normalizedSteps);

                const phaseOrder = questionnaireType === 'SAVICKAS'
                    ? [
                        ...normalizedSteps.map((s: StepDef) => s.id),
                        FIXED_CONCLUSION_ID,
                    ]
                    : [
                        ...normalizedSteps.map((s: StepDef) => s.id),
                        FIXED_QUESTIONS_ID,
                        FIXED_CONCLUSION_ID,
                    ];
                setPhases(phaseOrder);

                // Set first phase
                if (phaseOrder.length > 0) {
                    setCurrentPhase(phaseOrder[0]);
                }

                // Fixed-phase labels and texts
                if (data.label_guided_questions) setQuestionsLabel(data.label_guided_questions);
                if (data.label_guided_conclusion) setConclusionLabel(data.label_guided_conclusion);
                if (data.text_guided_questions_phase_banner) setQuestionsBanner(data.text_guided_questions_phase_banner);
                if (data.text_guided_questions_intro) setQuestionsIntro(data.text_guided_questions_intro);
                if (data.text_guided_conclusion) setConclusionText(data.text_guided_conclusion);
            } catch {
                if (questionnaireType === 'SAVICKAS') {
                    setSteps(SAVICKAS_FALLBACK_STEPS);
                    const fallbackOrder = [...SAVICKAS_FALLBACK_STEPS.map((s) => s.id), FIXED_CONCLUSION_ID];
                    setPhases(fallbackOrder);
                    setCurrentPhase(fallbackOrder[0]);
                } else {
                    // Fallback: empty steps, just questions + conclusion
                    setPhases([FIXED_QUESTIONS_ID, FIXED_CONCLUSION_ID]);
                    setCurrentPhase(FIXED_QUESTIONS_ID);
                }
            } finally {
                if (isMounted) setInitialLoading(false);
            }
        };

        loadData();
        return () => { isMounted = false; };
    }, [questionnaireType]);

    // Helpers for current phase
    const getStepDef = (phaseId: string): StepDef | undefined => steps.find(s => s.id === phaseId);

    const getPhaseLabel = (phaseId: string): string => {
        if (phaseId === FIXED_QUESTIONS_ID) return questionsLabel;
        if (phaseId === FIXED_CONCLUSION_ID) return conclusionLabel;
        return getStepDef(phaseId)?.label || phaseId;
    };

    const getPhaseColors = (phaseId: string) => {
        if (phaseId === FIXED_QUESTIONS_ID) return QUESTIONS_COLOR;
        if (phaseId === FIXED_CONCLUSION_ID) return CONCLUSION_COLOR;
        const step = getStepDef(phaseId);
        return (step && COLOR_THEMES[step.color_theme]) || DEFAULT_COLOR;
    };

    const isAnalysisStep = (phaseId: string): boolean => {
        return phaseId !== FIXED_QUESTIONS_ID && phaseId !== FIXED_CONCLUSION_ID;
    };

    const extractAdvanceSignal = (rawText: string): { cleanText: string; shouldAdvance: boolean } => {
        const shouldAdvance = rawText.includes(STEP_ADVANCE_MARKER);
        const cleanText = rawText.replace(/\[\[AVANZA_STEP\]\]/g, '').trim();
        return { cleanText, shouldAdvance };
    };

    // Phase change handler
    useEffect(() => {
        if (!currentPhase || initialLoading) return;
        if (lastProcessedPhase.current === currentPhase) return;
        lastProcessedPhase.current = currentPhase;
        setShowAdvanceSuggestion(false);
        setUserMessagesInPhase(0);

        if (currentPhase === FIXED_QUESTIONS_ID) {
            setLastAnalysisFailed(false);
            setMessages(prev => [...prev, {
                role: 'system',
                content: questionsBanner,
            }, {
                role: 'assistant',
                content: questionsIntro,
            }]);
        } else if (currentPhase === FIXED_CONCLUSION_ID) {
            setLastAnalysisFailed(false);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: conclusionText,
            }]);
        } else {
            setLastAnalysisFailed(false);
            const step = getStepDef(currentPhase);
            if (step) {
                generateAnalysis(step);
            }
        }
    }, [currentPhase, initialLoading]);

    const generateAnalysis = async (step: StepDef) => {
        setIsLoading(true);
        setLastAnalysisFailed(false);
        if (messages.length > 0) {
            setMessages(prev => [...prev, { role: 'system', content: `--- ${step.label} ---` }]);
        }

        try {
            const scoresContext = formatScoresForPrompt(scores);
            const buildPayload = (forceInlinePrompt: boolean) => {
                if (forceInlinePrompt && step.prompt) {
                    return {
                        message: step.prompt,
                        mode: step.system_prompt_mode,
                        use_phase_prompt: false,
                        scores_context: scoresContext,
                        session_id: sessionId,
                    };
                }
                return {
                    message: '',
                    mode: step.system_prompt_mode,
                    phase: step.id,
                    use_phase_prompt: true,
                    scores_context: scoresContext,
                    session_id: sessionId,
                };
            };

            const payloads = [buildPayload(false)];
            if (step.prompt) payloads.push(buildPayload(true));

            let res: Response | null = null;

            for (const payload of payloads) {
                for (let attempt = 0; attempt < 2; attempt++) {
                    try {
                        res = await fetch('/api/chat', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload),
                        });
                    } catch {
                        res = null;
                    }

                    if (res?.ok) break;
                    if (attempt === 0) await sleep(700);
                }
                if (res?.ok) break;
            }

            if (res?.ok) {
                const data = await res.json();
                const { cleanText, shouldAdvance } = extractAdvanceSignal(data.response || '');
                if (cleanText) {
                    setMessages(prev => [...prev, { role: 'assistant', content: cleanText }]);
                }
                setLastAnalysisFailed(false);
                const allowAutoAdvanceOnGenerate =
                    questionnaireType !== 'SAVICKAS' || step.id === 'savickas-final';
                if (shouldAdvance && allowAutoAdvanceOnGenerate) {
                    advancePhase();
                }
            } else {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: "Non sono riuscito a completare questo passaggio per un problema temporaneo. Usa il pulsante 'Ripeti passaggio' per rilanciare lo step."
                }]);
                setLastAnalysisFailed(true);
            }
        } catch {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: "Errore di connessione durante questo passaggio. Usa il pulsante 'Ripeti passaggio' per riprovare."
            }]);
            setLastAnalysisFailed(true);
        } finally {
            setIsLoading(false);
        }
    };

    const resolveInteractiveMode = (): string => {
        if (isAnalysisStep(currentPhase)) {
            return getStepDef(currentPhase)?.system_prompt_mode || 'generic';
        }
        if (questionnaireType === 'SAVICKAS') {
            return 'savickas-interview';
        }
        return 'generic';
    };

    const handleSend = async (e: { preventDefault: () => void }) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage = input;
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setInput('');
        setUserMessagesInPhase(prev => prev + 1);

        // Patto Savickas: "accetto" → ack statico e avanza senza chiamare l'AI
        const isPattoAck =
            questionnaireType === 'SAVICKAS'
            && currentPhase === 'savickas-patto'
            && /\baccetto\b/i.test(userMessage);
        if (isPattoAck) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Perfetto, grazie per la conferma! Iniziamo il nostro percorso.',
            }]);
            advancePhase();
            return;
        }

        setIsLoading(true);
        setShowAdvanceSuggestion(false);

        try {
            const currentStep = isAnalysisStep(currentPhase) ? getStepDef(currentPhase) : undefined;
            const effectiveMessage = (questionnaireType === 'SAVICKAS' && currentStep?.prompt)
                ? `ISTRUZIONI STEP CORRENTE (INTERNE): ${currentStep.prompt}\n\nRISPOSTA STUDENTE:\n${userMessage}`
                : userMessage;

            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: effectiveMessage,
                    mode: resolveInteractiveMode(),
                    phase: isAnalysisStep(currentPhase) ? currentPhase : undefined,
                    session_id: sessionId,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                const { cleanText, shouldAdvance } = extractAdvanceSignal(data.response || '');
                if (cleanText) {
                    setMessages(prev => [...prev, { role: 'assistant', content: cleanText }]);
                }
                if (shouldAdvance) {
                    // Per Savickas (tranne l'ultimo step): non avanzare automaticamente,
                    // ma mostrare un suggerimento all'utente che può scegliere quando andare avanti
                    if (questionnaireType === 'SAVICKAS' && currentPhase !== 'savickas-final') {
                        setShowAdvanceSuggestion(true);
                    } else {
                        advancePhase();
                    }
                }
            }
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Errore di connessione.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const advancePhase = () => {
        setShowAdvanceSuggestion(false);
        const currentIndex = phases.indexOf(currentPhase);
        if (currentIndex < phases.length - 1) {
            setCurrentPhase(phases[currentIndex + 1]);
        }
    };

    const repeatCurrentStep = () => {
        if (isLoading || !isAnalysisStep(currentPhase)) return;
        const step = getStepDef(currentPhase);
        if (step) generateAnalysis(step);
    };

    const handlePlayTTS = async (text: string, idx: number) => {
        if (playingMessageIdx === idx && audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
            setPlayingMessageIdx(null);
            return;
        }

        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }

        setPlayingMessageIdx(idx);
        setIsAudioLoading(true);

        try {
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            });

            if (!response.ok) throw new Error('TTS failed');

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audioRef.current = audio;

            audio.onended = () => {
                setPlayingMessageIdx(null);
                URL.revokeObjectURL(audioUrl);
            };

            audio.onerror = () => {
                setPlayingMessageIdx(null);
            };

            await audio.play();
        } catch (error) {
            console.error('TTS error:', error);
            setPlayingMessageIdx(null);
        } finally {
            setIsAudioLoading(false);
        }
    };

    // Loading state
    if (initialLoading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-140px)] min-h-[600px]">
                <div className="text-center space-y-3">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
                    <p className="text-sm text-slate-500">Caricamento percorso guidato...</p>
                </div>
            </div>
        );
    }

    const currentColors = getPhaseColors(currentPhase);
    const currentStepIndex = phases.indexOf(currentPhase) + 1;
    const totalSteps = phases.length;
    const sidebarPhases = phases.filter(p => p !== FIXED_CONCLUSION_ID);
    const hasScoreEntries = scoreGroups.some(group => group.entries.length > 0);

    return (
        <div className="grid lg:grid-cols-4 gap-6 h-[calc(100vh-140px)] min-h-[600px]">
            {/* Left Sidebar */}
            <div className="lg:col-span-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                {/* Phase Progress */}
                <div className="glass-panel p-4 rounded-xl space-y-3">
                    <div className="flex justify-between items-center">
                        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Percorso</h3>
                        <span className="text-xs text-slate-500">{currentStepIndex}/{totalSteps}</span>
                    </div>

                    <div className="space-y-2">
                        {sidebarPhases.map((phaseId, idx) => {
                            const isActive = currentPhase === phaseId;
                            const isDone = phases.indexOf(currentPhase) > phases.indexOf(phaseId);

                            return (
                                <div key={phaseId} className={cn(
                                    "flex items-center gap-2 p-2 rounded-lg text-xs transition-colors",
                                    isActive ? "bg-blue-50 text-blue-700 font-medium" : isDone ? "text-green-600" : "text-slate-400"
                                )}>
                                    <div className={cn(
                                        "w-4 h-4 rounded-full flex items-center justify-center text-[8px] border",
                                        isActive ? "border-blue-500 bg-blue-500 text-white" :
                                            isDone ? "border-green-500 bg-green-500 text-white" : "border-slate-300"
                                    )}>
                                        {isDone ? <CheckCircle2 className="w-2.5 h-2.5" /> : idx + 1}
                                    </div>
                                    <span className="truncate">{getPhaseLabel(phaseId)}</span>
                                </div>
                            );
                        })}
                    </div>

                    {currentPhase !== FIXED_CONCLUSION_ID && questionnaireType !== 'SAVICKAS' && (
                        <button
                            onClick={advancePhase}
                            disabled={isLoading}
                            className="w-full mt-2 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1 disabled:opacity-50 shadow-sm"
                        >
                            {currentPhase === FIXED_QUESTIONS_ID ? 'Concludi Sessione' : 'Prossimo Step'}
                            <ChevronRight className="w-3 h-3" />
                        </button>
                    )}

                    {currentPhase !== FIXED_CONCLUSION_ID && questionnaireType === 'SAVICKAS' && (showAdvanceSuggestion || userMessagesInPhase >= 3) && (
                        <button
                            onClick={advancePhase}
                            disabled={isLoading}
                            className="w-full mt-2 py-2.5 px-3 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1 disabled:opacity-50 shadow-sm"
                        >
                            Prossimo Argomento
                            <ChevronRight className="w-3 h-3" />
                        </button>
                    )}

                    {lastAnalysisFailed && isAnalysisStep(currentPhase) && (
                        <button
                            onClick={repeatCurrentStep}
                            disabled={isLoading}
                            className="w-full mt-2 py-2.5 px-3 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 shadow-sm"
                        >
                            Ripeti Passaggio
                        </button>
                    )}
                </div>

                {/* Scores Display */}
                {hasScoreEntries && (
                    <div className="glass-panel p-4 rounded-xl space-y-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                            <BarChart3 className="w-4 h-4" />
                            Punteggi
                        </div>

                        {scoreGroups.map((group, idx) => (
                            <div key={group.prefix} className={cn("space-y-1.5", idx > 0 && "pt-2 border-t border-slate-100")}>
                                <div className={cn("text-[10px] font-medium uppercase", group.colorClass)}>{group.label}</div>
                                {group.entries.map(([code, score]) => (
                                    <CompactScoreBar
                                        key={code}
                                        code={code}
                                        score={score}
                                        invertedSet={invertedSet}
                                        questionnaireType={questionnaireType}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Chat Area */}
            <div className="lg:col-span-3 flex flex-col h-full bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
                {/* Header */}
                <div className={cn("p-4 border-b border-slate-100 flex items-center gap-3", currentColors.headerBg)}>
                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shadow-sm", currentColors.iconBg)}>
                        <Bot className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800">CounselorBot AI</h3>
                        <p className="text-xs text-slate-500 font-medium">{getPhaseLabel(currentPhase)}</p>
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {messages.map((msg, idx) => (
                        <div key={idx} className={cn(
                            "flex animate-in fade-in slide-in-from-bottom-2 duration-300",
                            msg.role === 'user' ? 'justify-end' : msg.role === 'system' ? 'justify-center' : 'justify-start'
                        )}>
                            {msg.role === 'system' ? (
                                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest py-2 px-3 bg-slate-50 rounded-full">{msg.content}</span>
                            ) : (
                                <div className={cn("flex flex-col gap-1 max-w-[90%]", msg.role === 'user' ? "items-end" : "items-start")}>
                                    <div className={cn(
                                        "px-5 py-3.5 rounded-2xl text-sm leading-relaxed shadow-sm",
                                        msg.role === 'user'
                                            ? 'bg-blue-600 text-white rounded-tr-sm'
                                            : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'
                                    )}>
                                        {msg.role === 'assistant' ? (
                                            <div className="overflow-x-auto rounded-lg border border-slate-200/80 bg-white">
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={markdownComponents}
                                                >
                                                    {msg.content}
                                                </ReactMarkdown>
                                            </div>
                                        ) : msg.content}
                                    </div>

                                    {msg.role === 'assistant' && (
                                        <button
                                            onClick={() => handlePlayTTS(msg.content, idx)}
                                            disabled={isAudioLoading}
                                            className={cn(
                                                "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium transition-colors border",
                                                playingMessageIdx === idx
                                                    ? "bg-blue-50 text-blue-600 border-blue-200"
                                                    : "bg-transparent text-slate-400 border-transparent hover:bg-slate-50 hover:text-slate-600"
                                            )}
                                        >
                                            {isAudioLoading && playingMessageIdx === idx ? (
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                            ) : playingMessageIdx === idx ? (
                                                <Square className="w-3 h-3 fill-current" />
                                            ) : (
                                                <Volume2 className="w-3 h-3" />
                                            )}
                                            {playingMessageIdx === idx ? 'Stop Lettura' : 'Ascolta'}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}



                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="px-5 py-4 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center gap-3">
                                <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                                </span>
                                <span className="text-xs font-medium text-slate-500">Elaborazione analisi...</span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                {currentPhase === FIXED_CONCLUSION_ID ? (
                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-center">
                        <button
                            onClick={() => window.location.href = '/'}
                            className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl transition-colors flex items-center gap-2 shadow-lg shadow-green-200"
                        >
                            <Home className="w-5 h-5" />
                            Torna alla Home Page
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSend} className="p-4 border-t border-slate-100 bg-white">
                        <div className="relative flex items-center gap-2">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder={isLoading ? "Attendi la risposta..." : "Chiedi chiarimenti su questa fase..."}
                                disabled={isLoading}
                                className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 disabled:opacity-50"
                            />
                            <button
                                type="submit"
                                disabled={isLoading || !input.trim()}
                                className="p-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-md shadow-blue-200"
                            >
                                <Send className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="mt-2 text-center">
                            <p className="text-[10px] text-slate-400">
                                {isAnalysisStep(currentPhase)
                                    ? questionnaireType === 'SAVICKAS'
                                        ? "Rispondi liberamente. Quando hai condiviso abbastanza, apparirà un suggerimento per passare all'argomento successivo."
                                        : "Puoi fare domande sull'analisi corrente oppure cliccare 'Prossimo Step'."
                                    : "Fai qualsiasi domanda libera."}
                            </p>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
