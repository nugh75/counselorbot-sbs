'use client';

import { Send, Bot, ChevronRight, CheckCircle2, Loader2, BarChart3, Volume2, Square, Home, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useState, useEffect, useRef, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ZTPIFactorCode, ZTPI_FACTORS, getZTPIAlignmentColorClass } from '@/lib/ztpi-model';
import { QUESTIONNAIRES } from '@/lib/questionnaires';
import { streamChat } from '@/lib/chat-stream';
import { getSelectedCounselorId } from '@/lib/counselor';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useI18n } from '@/lib/i18n-context';
import { stepLabel } from '@/lib/i18n-steps';
import type { Lang } from '@/lib/i18n';
import { LearnerProfileCard } from '@/components/profile/LearnerProfileCard';

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
    locale?: string;
    scoresContextOverride?: string;
}

interface ChatMessage {
    role: string;
    content: string;
    reasoning?: string;
    strategyIds?: string[];
    responseId?: string;
    feedbackPhase?: string;
    feedback?: boolean;
}

type QuickReply = {
    label: string;
    action: 'send' | 'advance';
    emphasis?: boolean;
};

const ZTPI_REQUIRED_STEP_IDS = ['ztpi-t1', 'ztpi-t2', 'ztpi-t3', 'ztpi-t4', 'ztpi-t5', 'ztpi-btp'];
const SAVICKAS_REQUIRED_STEP_IDS = ['savickas-patto', 'savickas-q1', 'savickas-q2', 'savickas-q3', 'savickas-q4', 'savickas-q5', 'savickas-final'];
const SUPPORTED_LOCALES = new Set<Lang>(['it', 'en', 'es', 'fr', 'de', 'sv']);
// edge-tts voice per language (matches backend TTSRequest)
const TTS_VOICE_BY_LOCALE: Record<Lang, string> = {
    it: 'it-IT-IsabellaNeural',
    en: 'en-US-AriaNeural',
    es: 'es-ES-ElviraNeural',
    fr: 'fr-FR-DeniseNeural',
    de: 'de-DE-KatjaNeural',
    sv: 'sv-SE-SofieNeural',
};
const SAVICKAS_ACCEPT_PATTERNS: Record<string, RegExp> = {
    it: /\baccetto\b/i,
    en: /\b(?:i\s+accept|accept|i\s+agree|agree)\b/i,
    es: /\b(?:acepto|estoy\s+de\s+acuerdo|de\s+acuerdo)\b/i,
    fr: /\b(?:j['’]\s*accepte|accepte|d['’]\s*accord)\b/i,
    de: /\b(?:ich\s+akzeptiere|akzeptiere|einverstanden)\b/i,
    sv: /\b(?:jag\s+accepterar|accepterar|godk[aä]nner)\b/i,
};

function normalizeLocale(value?: string): Lang {
    const primary = (value || 'it').toLowerCase().replace('_', '-').split('-')[0] as Lang;
    return SUPPORTED_LOCALES.has(primary) ? primary : 'it';
}

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

const DEFAULT_COLOR = { headerBg: 'bg-indigo-50', iconBg: 'bg-indigo-600' };
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
    S: { label: 'Competenze Strategiche', colorClass: 'text-purple-600' },
    K: { label: 'Competenze e Convinzioni', colorClass: 'text-indigo-600' },
    AD: { label: 'Adattabilità Professionale', colorClass: 'text-green-600' },
};

// --- Score formatters per questionnaire type ---

function buildScoresFormatter(
    questionnaireType: string,
    factorName: (code: string, fallback: string) => string,
): (scores: Record<string, number>) => string {
    if (questionnaireType === 'SAVICKAS') {
        return (): string => {
            return 'CONTESTO INTERVISTA SAVICKAS: percorso narrativo qualitativo senza punteggi numerici.';
        };
    }

    // Agent-led questionnaires (QPCS, QPCC, QAP): qualitative, no numeric factors.
    const cfg = QUESTIONNAIRES[questionnaireType as keyof typeof QUESTIONNAIRES];
    if (!cfg || cfg.factorPrefix.length === 0) {
        return (): string => {
            return 'CONTESTO: percorso riflessivo guidato dall’AI, qualitativo, senza punteggi numerici.';
        };
    }

    if (questionnaireType === 'ZTPI') {
        return (scores: Record<string, number>): string => {
            const parts = Object.entries(scores)
                .filter(([k]) => k.startsWith('T'))
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([code, value]) => `${code} (${factorName(code, ZTPI_FACTORS[code as ZTPIFactorCode]?.name || code)}): ${value}/9`)
                .join(' ');
            return `PROFILO TEMPORALE DELLO STUDENTE:\n${parts}`;
        };
    }

    // Questionari basati su punteggi (QSA, QSAr, QPCS, QPCC, QAP): elenca i fattori
    // raggruppati per prefisso, ciascuno con il nome localizzato.
    return (scores: Record<string, number>): string => {
        const fallbackName = (code: string) => cfg?.factors.find((factor) => factor.code === code)?.name || code;
        const blocks = cfg.factorPrefix
            .map((prefix) =>
                Object.entries(scores)
                    .filter(([k]) => k.startsWith(prefix))
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([code, value]) => `- ${code} (${factorName(code, fallbackName(code))}): ${value}/9`)
                    .join('\n'),
            )
            .filter(Boolean)
            .join('\n');
        return `PROFILO ${questionnaireType} DELLO STUDENTE:\n${blocks}`;
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
    factorName,
    score,
    invertedSet,
    questionnaireType,
}: {
    code: string;
    factorName: string;
    score: number;
    invertedSet: Set<string>;
    questionnaireType: string;
}) {
    const color = getScoreColor(code, score, invertedSet, questionnaireType);
    const width = (score / 9) * 100;

    return (
        <div className="space-y-1">
            <div className="text-[10px] leading-tight text-slate-600 break-words" title={`${code} (${factorName})`}>
                <span className="font-mono font-semibold">{code}</span> <span>({factorName})</span>
            </div>
            <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${width}%` }} />
                </div>
                <span className="w-4 text-[10px] font-bold text-slate-600">{score}</span>
            </div>
        </div>
    );
}

// --- Markdown ---

function omitMarkdownNode<T extends { node?: unknown }>(props: T): Omit<T, 'node'> {
    const { node, ...elementProps } = props;
    void node;
    return elementProps;
}

const markdownComponents: Components = {
    table: (props) => (
        <table
            className="w-full min-w-[760px] border-separate border-spacing-0 text-sm text-slate-800"
            {...omitMarkdownNode(props)}
        />
    ),
    thead: (props) => <thead className="bg-slate-50" {...omitMarkdownNode(props)} />,
    tbody: (props) => <tbody className="[&_tr:nth-child(even)]:bg-slate-50/40" {...omitMarkdownNode(props)} />,
    tr: (props) => <tr className="border-b border-slate-100" {...omitMarkdownNode(props)} />,
    th: (props) => (
        <th
            className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600 border-b border-slate-200"
            {...omitMarkdownNode(props)}
        />
    ),
    td: (props) => <td className="px-3 py-2 align-top leading-relaxed border-b border-slate-100" {...omitMarkdownNode(props)} />,
    p: (props) => <p className="my-1.5 text-sm leading-relaxed" {...omitMarkdownNode(props)} />,
    ul: (props) => <ul className="my-2 pl-5 list-disc space-y-1" {...omitMarkdownNode(props)} />,
    ol: (props) => <ol className="my-2 pl-5 list-decimal space-y-1" {...omitMarkdownNode(props)} />,
    li: (props) => <li className="leading-relaxed" {...omitMarkdownNode(props)} />,
    strong: (props) => <strong className="font-semibold text-slate-900" {...omitMarkdownNode(props)} />,
};

// --- Main Component ---

export function GuidedChatInterface({ scores, questionnaireType, onComplete, sessionId, locale, scoresContextOverride }: GuidedChatInterfaceProps) {
    const { t, tf, lang: contextLang } = useI18n();
    const activeLocale = normalizeLocale(locale || contextLang);
    const [steps, setSteps] = useState<StepDef[]>([]);
    const [phases, setPhases] = useState<string[]>([]);
    const [currentPhase, setCurrentPhase] = useState<string>('');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [lastAnalysisFailed, setLastAnalysisFailed] = useState(false);
    const [playingMessageIdx, setPlayingMessageIdx] = useState<number | null>(null);
    const [isAudioLoading, setIsAudioLoading] = useState(false);
    const [showAdvanceSuggestion, setShowAdvanceSuggestion] = useState(false);
    const [userMessagesInPhase, setUserMessagesInPhase] = useState(0);
    // Indici dei messaggi con il box "Ragionamento" collassato (toggle per nasconderlo).
    const [hiddenReasoning, setHiddenReasoning] = useState<Set<number>>(new Set());
    const toggleReasoning = (idx: number) => setHiddenReasoning(prev => {
        const next = new Set(prev);
        if (next.has(idx)) next.delete(idx); else next.add(idx);
        return next;
    });

    // Fixed-phase configurable texts (default tradotti via i18n; override da DB solo in italiano)
    const [questionsLabel, setQuestionsLabel] = useState(() => t('guided.questionsLabel'));
    const [conclusionLabel, setConclusionLabel] = useState(() => t('guided.conclusionLabel'));
    const [questionsBanner, setQuestionsBanner] = useState(() => t('guided.questionsBanner'));
    const [questionsIntro, setQuestionsIntro] = useState(() => t('guided.questionsIntro'));
    const [conclusionText, setConclusionText] = useState(() => t('guided.conclusionText'));

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const requestRef = useRef<AbortController | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const lastProcessedPhase = useRef<string | null>(null);
    const loadedSessionScopeRef = useRef('');

    // Derived from questionnaire config
    const questionnaire = useMemo(() => QUESTIONNAIRES[questionnaireType as keyof typeof QUESTIONNAIRES], [questionnaireType]);
    const invertedSet = useMemo(() => new Set(questionnaire?.invertedFactors || []), [questionnaire]);
    const formatScoresForPrompt = useMemo(
        () => buildScoresFormatter(questionnaireType, (code, fallback) => tf(`factor.${code}.name`, fallback)),
        [questionnaireType, tf],
    );

    // Score groups for sidebar
    const scoreGroups = useMemo(() => {
        if (!questionnaire) return [];
        return questionnaire.factorPrefix.map(prefix => ({
            prefix,
            label: PREFIX_SIDEBAR[prefix] ? t(`sidebar.${prefix}`) : prefix,
            colorClass: PREFIX_SIDEBAR[prefix]?.colorClass || 'text-slate-600',
            entries: Object.entries(scores)
                .filter(([k]) => k.startsWith(prefix))
                .sort(([a], [b]) => a.localeCompare(b)),
        }));
    }, [scores, questionnaire, t]);

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
            requestRef.current?.abort();
        };
    }, []);

    const beginRequest = () => {
        requestRef.current?.abort();
        const controller = new AbortController();
        requestRef.current = controller;
        return controller;
    };

    const setLastFeedbackTargets = (strategyIds?: string[], responseId?: string) => {
        if (!strategyIds?.length && !responseId) return;
        setMessages(prev => {
            const copy = [...prev];
            copy[copy.length - 1] = {
                ...copy[copy.length - 1],
                strategyIds,
                responseId,
                feedbackPhase: currentPhase,
            };
            return copy;
        });
    };

    const submitStrategyFeedback = async (messageIndex: number, helpful: boolean) => {
        const message = messages[messageIndex];
        if ((!message?.strategyIds?.length && !message?.responseId) || message.feedback !== undefined) return;
        const response = await fetch('/api/strategy-feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                strategy_ids: message.strategyIds || [],
                response_id: message.responseId,
                questionnaire_type: questionnaireType,
                phase: message.feedbackPhase || currentPhase,
                language: activeLocale,
                helpful,
            }),
        });
        if (!response.ok) return;
        setMessages(prev => prev.map((item, idx) => (
            idx === messageIndex ? { ...item, feedback: helpful } : item
        )));
    };

    // Load step definitions and config texts from backend
    useEffect(() => {
        let isMounted = true;

        const loadData = async () => {
            try {
                const res = await fetch(`/api/qsa/guided-ui-texts?questionnaire_type=${questionnaireType}&lang=${activeLocale}`);
                if (!res.ok) return;

                const data = await res.json();
                if (!isMounted) return;

                // Dynamic steps — localizza le etichette in EN/SV (fallback al testo DB)
                const loadedSteps: StepDef[] = data.guided_steps || [];
                const normalizedSteps = normalizeLoadedSteps(questionnaireType, loadedSteps)
                    .map((s) => ({ ...s, label: stepLabel(activeLocale, s.id, s.label) }));
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
                const sessionScope = `${questionnaireType}:${sessionId}`;
                const shouldRestoreSession = loadedSessionScopeRef.current !== sessionScope;

                // Check if we can resume the session state from backend memory
                try {
                    const memRes = await fetch(`/api/memory/user/${sessionId}`);
                    if (memRes.ok) {
                        const memData = await memRes.json();
                        const restoredPhase = memData.current_phase as string | undefined;
                        if (restoredPhase && phaseOrder.includes(restoredPhase) && shouldRestoreSession) {
                            const restoredQuestionsLabel = data.label_guided_questions || t('guided.questionsLabel');
                            const restoredConclusionLabel = data.label_guided_conclusion || t('guided.conclusionLabel');
                            setCurrentPhase(restoredPhase);
                            setMessages([
                                {
                                    role: 'system',
                                    content: t('guided.resumed', { step:
                                        restoredPhase === FIXED_QUESTIONS_ID
                                            ? restoredQuestionsLabel
                                            : restoredPhase === FIXED_CONCLUSION_ID
                                            ? restoredConclusionLabel
                                            : normalizedSteps.find((s: StepDef) => s.id === restoredPhase)?.label || restoredPhase
                                    })
                                }
                            ]);
                        } else if (phaseOrder.length > 0 && shouldRestoreSession) {
                            setCurrentPhase(phaseOrder[0]);
                        }
                    } else if (phaseOrder.length > 0 && shouldRestoreSession) {
                        setCurrentPhase(phaseOrder[0]);
                    }
                } catch {
                    if (phaseOrder.length > 0 && shouldRestoreSession) {
                        setCurrentPhase(phaseOrder[0]);
                    }
                }
                loadedSessionScopeRef.current = sessionScope;

                // Testi/etichette ora localizzati lato backend per la lingua richiesta
                // (chiave per-lingua con fallback all'italiano): si applicano per ogni lingua.
                setQuestionsLabel(data.label_guided_questions || t('guided.questionsLabel'));
                setConclusionLabel(data.label_guided_conclusion || t('guided.conclusionLabel'));
                setQuestionsBanner(data.text_guided_questions_phase_banner || t('guided.questionsBanner'));
                setQuestionsIntro(data.text_guided_questions_intro || t('guided.questionsIntro'));
                setConclusionText(data.text_guided_conclusion || t('guided.conclusionText'));
            } catch {
                if (questionnaireType === 'SAVICKAS') {
                    setSteps(SAVICKAS_FALLBACK_STEPS.map((s) => ({ ...s, label: stepLabel(activeLocale, s.id, s.label) })));
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
    }, [questionnaireType, sessionId, activeLocale, t]);

    // Helpers for current phase
    const getStepDef = (phaseId: string): StepDef | undefined => steps.find(s => s.id === phaseId);

    const getPhaseLabel = (phaseId: string): string => {
        if (phaseId === FIXED_QUESTIONS_ID) return questionsLabel;
        if (phaseId === FIXED_CONCLUSION_ID) return conclusionLabel;
        return getStepDef(phaseId)?.label || phaseId;
    };

    const recordMemoryEvent = async (phaseId: string, completedStep: boolean, userMessage = '') => {
        if (!sessionId || !phaseId) return;
        try {
            await fetch('/api/memory/event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    session_id: sessionId,
                    questionnaire_type: questionnaireType,
                    language: activeLocale,
                    phase: phaseId,
                    step_label: getPhaseLabel(phaseId),
                    completed_step: completedStep,
                    user_message: userMessage,
                }),
            });
        } catch {
            // A memory update must not block the counseling workflow.
        }
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
            void recordMemoryEvent(currentPhase, false);
            const phaseMessages: ChatMessage[] = [];
            if (scoresContextOverride) {
                phaseMessages.push({
                    role: 'system',
                    content: `CONTESTO PROFILI COMBINATI:\n${scoresContextOverride}`,
                });
            }
            phaseMessages.push({ role: 'system', content: questionsBanner }, { role: 'assistant', content: questionsIntro });
            setMessages(prev => [...prev, ...phaseMessages]);
        } else if (currentPhase === FIXED_CONCLUSION_ID) {
            setLastAnalysisFailed(false);
            void recordMemoryEvent(currentPhase, true);
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
        // The phase guard above intentionally makes this effect run once per phase.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPhase, initialLoading]);

    const generateAnalysis = async (step: StepDef) => {
        const controller = beginRequest();
        setIsLoading(true);
        setLastAnalysisFailed(false);
        if (messages.length > 0) {
            setMessages(prev => [...prev, { role: 'system', content: `--- ${step.label} ---` }]);
        }

        try {
            const scoresContext = scoresContextOverride ?? formatScoresForPrompt(scores);
            const buildPayload = (forceInlinePrompt: boolean) => {
                if (forceInlinePrompt && step.prompt) {
                    return {
                        message: step.prompt,
                        mode: step.system_prompt_mode,
                        use_phase_prompt: false,
                        scores_context: scoresContext,
                        session_id: sessionId,
                        questionnaire_type: questionnaireType,
                        language: activeLocale,
                        max_tokens: 700,
                        counselor_id: getSelectedCounselorId(),
                    };
                }
                return {
                    message: '',
                    mode: step.system_prompt_mode,
                    phase: step.id,
                    use_phase_prompt: true,
                    scores_context: scoresContext,
                    session_id: sessionId,
                    questionnaire_type: questionnaireType,
                    language: activeLocale,
                    max_tokens: 700,
                    counselor_id: getSelectedCounselorId(),
                };
            };

            let responseText = '';
            let streamOk = false;
            const updateLast = (content: string) => {
                setMessages(prev => {
                    const copy = [...prev];
                    copy[copy.length - 1] = { ...copy[copy.length - 1], role: 'assistant', content };
                    return copy;
                });
            };
            const updateReasoning = (reasoning: string) => {
                setMessages(prev => {
                    const copy = [...prev];
                    copy[copy.length - 1] = { ...copy[copy.length - 1], role: 'assistant', reasoning };
                    return copy;
                });
            };
            const dropLast = () => setMessages(prev => prev.slice(0, -1));

            setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
            try {
                const result = await streamChat(buildPayload(false), (full) => updateLast(full), controller.signal, (r) => updateReasoning(r));
                responseText = result.response || '';
                setLastFeedbackTargets(result.strategy_ids, result.response_id);
                streamOk = true;
            } catch {
                if (controller.signal.aborted) return;
                dropLast();
            }

            if (streamOk && extractAdvanceSignal(responseText).cleanText) {
                const { cleanText, shouldAdvance } = extractAdvanceSignal(responseText);
                updateLast(cleanText);
                setLastAnalysisFailed(false);
                const allowAutoAdvanceOnGenerate =
                    questionnaireType !== 'SAVICKAS' || step.id === 'savickas-final';
                if (shouldAdvance && allowAutoAdvanceOnGenerate) {
                    await advancePhase();
                }
            } else if (streamOk) {
                // Stream ok ma nessun testo di risposta (es. reasoning ha esaurito il budget):
                // non lasciare il vuoto, segnala l'errore così l'utente può ripetere lo step.
                dropLast();
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: t('guided.stepError')
                }]);
                setLastAnalysisFailed(true);
            } else {
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: t('guided.stepError')
                }]);
                setLastAnalysisFailed(true);
            }
        } catch {
            if (controller.signal.aborted) return;
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: t('guided.stepConnError')
            }]);
            setLastAnalysisFailed(true);
        } finally {
            if (requestRef.current === controller) {
                requestRef.current = null;
                setIsLoading(false);
            }
        }
    };

    const resolveInteractiveMode = (): string => {
        if (isAnalysisStep(currentPhase)) {
            const stepMode = getStepDef(currentPhase)?.system_prompt_mode || 'generic';
            // Strategy questionnaires: a follow-up should not re-generate the full analysis.
            // (tabella + tutti i fattori). Prompt discorsivo e mirato.
            if (questionnaireType === 'QSA' && (stepMode === 'factor' || stepMode === 'second-level')) {
                return 'factor-qa';
            }
            if (questionnaireType === 'QSAr' && (stepMode === 'qsar-factor' || stepMode === 'qsar-second-level')) {
                return 'qsar-factor-qa';
            }
            return stepMode;
        }
        if (questionnaireType === 'SAVICKAS') {
            return 'savickas-interview';
        }
        if (questionnaireType === 'QSAr') {
            return 'qsar-generic';
        }
        return 'generic';
    };

    const handleSend = async (e: { preventDefault: () => void }, overrideText?: string) => {
        e.preventDefault();
        const userMessage = (overrideText ?? input).trim();
        if (!userMessage || isLoading) return;

        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setInput('');
        setUserMessagesInPhase(prev => prev + 1);

        // Patto Savickas: l'accettazione localizzata avanza senza chiamare l'AI.
        const isPattoAck =
            questionnaireType === 'SAVICKAS'
            && currentPhase === 'savickas-patto'
            && (SAVICKAS_ACCEPT_PATTERNS[activeLocale] || SAVICKAS_ACCEPT_PATTERNS.it).test(userMessage);
        if (isPattoAck) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: t('guided.pattoAck'),
            }]);
            await advancePhase(userMessage);
            return;
        }

        setIsLoading(true);
        setShowAdvanceSuggestion(false);
        const controller = beginRequest();

        try {
            const currentStep = isAnalysisStep(currentPhase) ? getStepDef(currentPhase) : undefined;
            const effectiveMessage = (questionnaireType === 'SAVICKAS' && currentStep?.prompt)
                ? `CURRENT STEP INTERNAL INSTRUCTIONS (use them only as guidance; answer the student in language "${activeLocale}"):\n${currentStep.prompt}\n\nSTUDENT ANSWER:\n${userMessage}`
                : userMessage;

            // Placeholder dell'assistente, riempito in streaming
            setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
            const updateLast = (content: string) => {
                setMessages(prev => {
                    const copy = [...prev];
                    copy[copy.length - 1] = { ...copy[copy.length - 1], role: 'assistant', content };
                    return copy;
                });
            };
            const updateReasoning = (reasoning: string) => {
                setMessages(prev => {
                    const copy = [...prev];
                    copy[copy.length - 1] = { ...copy[copy.length - 1], role: 'assistant', reasoning };
                    return copy;
                });
            };
            const dropLast = () => setMessages(prev => prev.slice(0, -1));

            const chatPayload: Record<string, unknown> = {
                message: effectiveMessage,
                memory_message: userMessage,
                mode: resolveInteractiveMode(),
                phase: isAnalysisStep(currentPhase) ? currentPhase : undefined,
                session_id: sessionId,
                questionnaire_type: questionnaireType,
                language: activeLocale,
                max_tokens: 900,
                counselor_id: getSelectedCounselorId(),
            };
            if (scoresContextOverride) {
                chatPayload.scores_context = scoresContextOverride;
            }
            const result = await streamChat(
                chatPayload,
                (full) => updateLast(full),
                controller.signal,
                (r) => updateReasoning(r),
            );
            const { response } = result;
            setLastFeedbackTargets(result.strategy_ids, result.response_id);

            // Sul testo completo applica il segnale di avanzamento
            const { cleanText, shouldAdvance } = extractAdvanceSignal(response || '');
            if (cleanText) {
                updateLast(cleanText);
            } else {
                dropLast();
            }
            if (shouldAdvance) {
                // Per Savickas (tranne l'ultimo step): non avanzare automaticamente,
                // ma mostrare un suggerimento all'utente che può scegliere quando andare avanti
                if (questionnaireType === 'SAVICKAS' && currentPhase !== 'savickas-final') {
                    setShowAdvanceSuggestion(true);
                } else {
                    await advancePhase();
                }
            }
        } catch {
            if (controller.signal.aborted) return;
            setMessages(prev => [...prev, { role: 'assistant', content: t('guided.connError') }]);
        } finally {
            if (requestRef.current === controller) {
                requestRef.current = null;
                setIsLoading(false);
            }
        }
    };

    const advancePhase = async (userMessage = '') => {
        setShowAdvanceSuggestion(false);
        await recordMemoryEvent(currentPhase, true, userMessage);
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
                body: JSON.stringify({ text, voice: TTS_VOICE_BY_LOCALE[activeLocale] }),
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
            <div className="flex items-center justify-center h-chat min-h-[600px]">
                <div className="text-center space-y-3">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mx-auto" />
                    <p className="text-sm text-slate-500">{t('guided.loading')}</p>
                </div>
            </div>
        );
    }

    const currentColors = getPhaseColors(currentPhase);
    const currentStepIndex = phases.indexOf(currentPhase) + 1;
    const totalSteps = phases.length;
    const sidebarPhases = phases.filter(p => p !== FIXED_CONCLUSION_ID);
    const hasScoreEntries = scoreGroups.some(group => group.entries.length > 0);
    const isSavickasAgreement = questionnaireType === 'SAVICKAS' && currentPhase === 'savickas-patto';
    const quickReplies: QuickReply[] = (() => {
        if (questionnaireType === 'SAVICKAS') {
            if (isSavickasAgreement) {
                return [{ label: t('guided.qr.accept'), action: 'send', emphasis: true }];
            }
            if (isAnalysisStep(currentPhase)) {
                const replies: QuickReply[] = [
                    { label: t('guided.qr.rephrase'), action: 'send' },
                    { label: t('guided.qr.reflect'), action: 'send' },
                ];
                if (showAdvanceSuggestion || userMessagesInPhase > 0) {
                    replies.push({ label: t('guided.qr.readyNext'), action: 'advance' });
                }
                return replies;
            }
        }
        return [
            { label: t('guided.qr.example'), action: 'send' },
            { label: t('guided.qr.unsure'), action: 'send' },
            { label: t('guided.qr.more'), action: 'send' },
        ];
    })();
    const inputPlaceholder = isLoading
        ? t('guided.input.waiting')
        : isSavickasAgreement
            ? t('guided.input.pattoPlaceholder')
            : t('guided.input.placeholder');
    const inputHint = isSavickasAgreement
        ? t('guided.hint.savickasPatto')
        : isAnalysisStep(currentPhase)
            ? questionnaireType === 'SAVICKAS'
                ? t('guided.hint.savickas')
                : t('guided.hint.analysis')
            : t('guided.hint.free');

    return (
        <div className="grid lg:grid-cols-4 gap-6 h-chat min-h-[600px]">
            {/* Left Sidebar */}
            <div className="lg:col-span-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                {/* Phase Progress */}
                <div className="glass-panel p-4 space-y-3">
                    <div className="flex justify-between items-center">
                        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">{t('guided.path')}</h3>
                        <span className="text-xs text-slate-500">{currentStepIndex}/{totalSteps}</span>
                    </div>

                    <div className="space-y-2">
                        {sidebarPhases.map((phaseId, idx) => {
                            const isActive = currentPhase === phaseId;
                            const isDone = phases.indexOf(currentPhase) > phases.indexOf(phaseId);

                            return (
                                <div key={phaseId} className={cn(
                                    "flex items-center gap-2 p-2 rounded-lg text-xs transition-colors",
                                    isActive ? "bg-indigo-50 text-indigo-700 font-medium" : isDone ? "text-green-600" : "text-slate-400"
                                )}>
                                    <div className={cn(
                                        "w-4 h-4 rounded-full flex items-center justify-center text-[8px] border",
                                        isActive ? "border-indigo-500 bg-indigo-500 text-white" :
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
                            onClick={() => void advancePhase()}
                            disabled={isLoading}
                            className="w-full mt-2 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1 disabled:opacity-50 shadow-sm"
                        >
                            {currentPhase === FIXED_QUESTIONS_ID ? t('guided.concludeSession') : t('guided.nextStep')}
                            <ChevronRight className="w-3 h-3" />
                        </button>
                    )}

                    {currentPhase !== FIXED_CONCLUSION_ID && questionnaireType === 'SAVICKAS' && currentPhase !== 'savickas-patto' && (showAdvanceSuggestion || userMessagesInPhase >= 3) && (
                        <button
                            onClick={() => void advancePhase()}
                            disabled={isLoading}
                            className="w-full mt-2 py-2.5 px-3 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1 disabled:opacity-50 shadow-sm"
                        >
                            {t('guided.nextTopic')}
                            <ChevronRight className="w-3 h-3" />
                        </button>
                    )}

                    {lastAnalysisFailed && isAnalysisStep(currentPhase) && (
                        <button
                            onClick={repeatCurrentStep}
                            disabled={isLoading}
                            className="w-full mt-2 py-2.5 px-3 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 shadow-sm"
                        >
                            {t('guided.repeatStep')}
                        </button>
                    )}
                </div>

                {/* Scores Display */}
                {hasScoreEntries && (
                    <div className="glass-panel p-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                            <BarChart3 className="w-4 h-4" />
                            {t('guided.scores')}
                        </div>

                        {scoreGroups.map((group, idx) => (
                            <div key={group.prefix} className={cn("space-y-1.5", idx > 0 && "pt-2 border-t border-slate-100")}>
                                <div className={cn("text-[10px] font-medium uppercase", group.colorClass)}>{group.label}</div>
                                {group.entries.map(([code, score]) => (
                                    <CompactScoreBar
                                        key={code}
                                        code={code}
                                        factorName={tf(
                                            `factor.${code}.name`,
                                            questionnaire.factors.find((factor) => factor.code === code)?.name || code,
                                        )}
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
            <div className="lg:col-span-3 flex flex-col h-full bg-white rounded-lg overflow-hidden border border-slate-200 shadow-sm">
                {/* Header */}
                <div className={cn("p-4 border-b border-slate-100 flex items-center gap-3", currentColors.headerBg)}>
                    <div className={cn("w-10 h-10 rounded-md flex items-center justify-center shadow-sm", currentColors.iconBg)}>
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
                                        "px-5 py-3.5 rounded-lg text-sm leading-relaxed shadow-sm",
                                        msg.role === 'user'
                                            ? 'bg-indigo-600 text-white rounded-tr-sm'
                                            : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm'
                                    )}>
                                        {msg.role === 'assistant' ? (
                                            <div className="space-y-2">
                                                {msg.reasoning && (
                                                    <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleReasoning(idx)}
                                                            className="flex w-full items-center gap-1.5 text-[10px] uppercase tracking-wide text-slate-400 hover:text-slate-600 transition-colors"
                                                        >
                                                            {!msg.content.trim() && <Loader2 className="w-3 h-3 animate-spin" />}
                                                            <ChevronRight className={cn("w-3 h-3 transition-transform", !hiddenReasoning.has(idx) && "rotate-90")} />
                                                            {t('guided.reasoning')}
                                                            <span className="ml-auto normal-case tracking-normal text-slate-400/80">
                                                                {hiddenReasoning.has(idx) ? t('guided.reasoningShow') : t('guided.reasoningHide')}
                                                            </span>
                                                        </button>
                                                        {!hiddenReasoning.has(idx) && (
                                                            <div className="mt-1 text-[11px] leading-snug text-slate-500 italic whitespace-pre-wrap max-h-40 overflow-y-auto">
                                                                {msg.reasoning}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {msg.content.trim() ? (
                                                    <div className="overflow-x-auto rounded-lg border border-slate-200/80 bg-white">
                                                        <ReactMarkdown
                                                            remarkPlugins={[remarkGfm]}
                                                            components={markdownComponents}
                                                        >
                                                            {msg.content}
                                                        </ReactMarkdown>
                                                    </div>
                                                ) : !msg.reasoning ? (
                                                    <span className="flex items-center gap-2 text-slate-400 italic">
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        {t('guided.thinking')}
                                                    </span>
                                                ) : null}
                                            </div>
                                        ) : msg.content}
                                    </div>

                                    {msg.role === 'assistant' && msg.content.trim() && (
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => handlePlayTTS(msg.content, idx)}
                                                disabled={isAudioLoading}
                                                className={cn(
                                                    "flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium transition-colors border",
                                                    playingMessageIdx === idx
                                                        ? "bg-indigo-50 text-indigo-600 border-indigo-200"
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
                                                {playingMessageIdx === idx ? t('guided.stopListen') : t('guided.listen')}
                                            </button>
                                            {(!!msg.strategyIds?.length || !!msg.responseId) && (
                                                <>
                                                    <button
                                                        type="button"
                                                        title={t('guided.feedback.helpful')}
                                                        aria-label={t('guided.feedback.helpful')}
                                                        onClick={() => submitStrategyFeedback(idx, true)}
                                                        className={cn("p-1 rounded text-slate-400 hover:text-green-600", msg.feedback === true && "text-green-600")}
                                                    >
                                                        <ThumbsUp className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        title={t('guided.feedback.notHelpful')}
                                                        aria-label={t('guided.feedback.notHelpful')}
                                                        onClick={() => submitStrategyFeedback(idx, false)}
                                                        className={cn("p-1 rounded text-slate-400 hover:text-red-600", msg.feedback === false && "text-red-600")}
                                                    >
                                                        <ThumbsDown className="w-3.5 h-3.5" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}



                    {isLoading && (
                        <div className="flex justify-start">
                            <div className="px-5 py-4 rounded-lg bg-white border border-slate-100 shadow-sm flex items-center gap-3">
                                <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                                </span>
                                <span className="text-xs font-medium text-slate-500">{t('guided.processing')}</span>
                            </div>
                        </div>
                    )}
                    {/* Fine sessione: invito a rivedere il profilo dopo la conversazione */}
                    {currentPhase === FIXED_CONCLUSION_ID && (
                        <div className="max-w-2xl">
                            <LearnerProfileCard variant="update" sessionId={sessionId} />
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                {currentPhase === FIXED_CONCLUSION_ID ? (
                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-center">
                        <button
                            onClick={onComplete}
                            className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md transition-colors flex items-center gap-2"
                        >
                            <Home className="w-5 h-5" />
                            {t('guided.backHome')}
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleSend} className="p-4 border-t border-slate-100 bg-white">
                        {/* Risposte rapide: accelerano l'interazione (utile da mobile). */}
                        {!isLoading && messages.length > 0 && quickReplies.length > 0 && (
                            <div className="mb-2 flex flex-wrap gap-1.5">
                                {quickReplies.map((reply) => (
                                    <button
                                        key={reply.label}
                                        type="button"
                                        onClick={() => {
                                            if (reply.action === 'advance') {
                                                void advancePhase();
                                                return;
                                            }
                                            void handleSend({ preventDefault() {} }, reply.label);
                                        }}
                                        className={cn(
                                            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                                            reply.emphasis
                                                ? "border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100"
                                                : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                                        )}
                                    >
                                        {reply.label}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div className="relative flex items-center gap-2">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder={inputPlaceholder}
                                disabled={isLoading}
                                className="flex-1 bg-slate-50 border border-slate-200 rounded-md px-4 py-3 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400 disabled:opacity-50"
                            />
                            <button
                                type="submit"
                                disabled={isLoading || !input.trim()}
                                className="p-3 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
                            >
                                <Send className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="mt-2 text-center">
                            <p className="text-[10px] text-slate-400">
                                {inputHint}
                            </p>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
