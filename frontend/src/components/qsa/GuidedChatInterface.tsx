'use client';

import { Send, Bot, ChevronRight, CheckCircle2, Loader2, BarChart3, Volume2, Square, Home } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { QSAFactorCode, QSA_FACTORS, analyzeScore } from '@/lib/qsa-model';
import ReactMarkdown from 'react-markdown';
import { useRouter } from 'next/navigation';

// --- Types ---

interface StepDef {
    id: string;
    sort_order: number;
    label: string;
    system_prompt_mode: string;
    color_theme: string;
}

interface GuidedChatInterfaceProps {
    scores: Record<QSAFactorCode, number>;
    onComplete: () => void;
    sessionId: string;
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

// --- Helpers ---

const INVERTED_FACTORS: QSAFactorCode[] = ['C3', 'C6', 'A1', 'A4', 'A5', 'A7'];

function formatScoresForPrompt(scores: Record<QSAFactorCode, number>): string {
    const lines: string[] = ['PROFILO QSA DELLO STUDENTE:'];

    lines.push('\nStrategie Cognitive:');
    Object.entries(scores).filter(([k]) => k.startsWith('C')).forEach(([code, value]) => {
        const factor = QSA_FACTORS[code as QSAFactorCode];
        const analysis = analyzeScore(code as QSAFactorCode, value);
        lines.push(`- ${code} ${factor.name}: ${value}/9 (${analysis.interpretation})`);
    });

    lines.push('\nStrategie Affettive:');
    Object.entries(scores).filter(([k]) => k.startsWith('A')).forEach(([code, value]) => {
        const factor = QSA_FACTORS[code as QSAFactorCode];
        const analysis = analyzeScore(code as QSAFactorCode, value);
        lines.push(`- ${code} ${factor.name}: ${value}/9 (${analysis.interpretation})`);
    });

    return lines.join('\n');
}

function getScoreColor(code: QSAFactorCode, score: number): string {
    const isInverted = INVERTED_FACTORS.includes(code);
    if (score <= 3) return isInverted ? 'bg-green-500' : 'bg-red-500';
    if (score <= 6) return 'bg-yellow-500';
    return isInverted ? 'bg-red-500' : 'bg-green-500';
}

function CompactScoreBar({ code, score }: { code: QSAFactorCode; score: number }) {
    const color = getScoreColor(code, score);
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

// --- Main Component ---

export function GuidedChatInterface({ scores, onComplete, sessionId }: GuidedChatInterfaceProps) {
    const router = useRouter();
    const [steps, setSteps] = useState<StepDef[]>([]);
    const [phases, setPhases] = useState<string[]>([]);
    const [currentPhase, setCurrentPhase] = useState<string>('');
    const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [playingMessageIdx, setPlayingMessageIdx] = useState<number | null>(null);
    const [isAudioLoading, setIsAudioLoading] = useState(false);

    // Fixed-phase configurable texts
    const [questionsLabel, setQuestionsLabel] = useState('4. Domande e Approfondimenti');
    const [conclusionLabel, setConclusionLabel] = useState('Conclusione');
    const [questionsBanner, setQuestionsBanner] = useState('--- Fase 4: Domande e Approfondimenti ---');
    const [questionsIntro, setQuestionsIntro] = useState(
        "Abbiamo completato l'analisi strutturata. Ora puoi farmi qualsiasi domanda libera sul tuo metodo di studio, sui risultati o chiedere consigli specifici."
    );
    const [conclusionText, setConclusionText] = useState(
        'Hai completato il percorso di analisi del QSA. Spero ti sia stato utile! Clicca sul pulsante in basso per tornare alla Home Page.'
    );

    const audioRef = useRef<HTMLAudioElement | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const lastProcessedPhase = useRef<string | null>(null);

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
                const res = await fetch('/counselorbot/api/qsa/guided-ui-texts');
                if (!res.ok) return;

                const data = await res.json();
                if (!isMounted) return;

                // Dynamic steps
                const loadedSteps: StepDef[] = data.guided_steps || [];
                setSteps(loadedSteps);

                // Build phase order: [...step ids, 'questions', 'conclusion']
                const phaseOrder = [
                    ...loadedSteps.map((s: StepDef) => s.id),
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
                // Fallback: empty steps, just questions + conclusion
                setPhases([FIXED_QUESTIONS_ID, FIXED_CONCLUSION_ID]);
                setCurrentPhase(FIXED_QUESTIONS_ID);
            } finally {
                if (isMounted) setInitialLoading(false);
            }
        };

        loadData();
        return () => { isMounted = false; };
    }, []);

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

    // Phase change handler
    useEffect(() => {
        if (!currentPhase || initialLoading) return;
        if (lastProcessedPhase.current === currentPhase) return;
        lastProcessedPhase.current = currentPhase;

        if (currentPhase === FIXED_QUESTIONS_ID) {
            setMessages(prev => [...prev, {
                role: 'system',
                content: questionsBanner,
            }, {
                role: 'assistant',
                content: questionsIntro,
            }]);
        } else if (currentPhase === FIXED_CONCLUSION_ID) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: conclusionText,
            }]);
        } else {
            // Auto-generate analysis for dynamic steps
            const step = getStepDef(currentPhase);
            if (step) {
                generateAnalysis(step);
            }
        }
    }, [currentPhase, initialLoading]);

    const generateAnalysis = async (step: StepDef) => {
        setIsLoading(true);
        if (messages.length > 0) {
            setMessages(prev => [...prev, { role: 'system', content: `--- ${step.label} ---` }]);
        }

        try {
            const scoresContext = formatScoresForPrompt(scores);
            const res = await fetch('/counselorbot/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: '',
                    mode: step.system_prompt_mode,
                    phase: step.id,
                    use_phase_prompt: true,
                    scores_context: scoresContext,
                    session_id: sessionId,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
            } else {
                setMessages(prev => [...prev, { role: 'assistant', content: "Errore durante l'analisi." }]);
            }
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Errore di connessione.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSend = async (e: { preventDefault: () => void }) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage = input;
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setInput('');
        setIsLoading(true);

        try {
            const scoresContext = formatScoresForPrompt(scores);
            const step = getStepDef(currentPhase);
            const mode = currentPhase === FIXED_QUESTIONS_ID
                ? 'generic'
                : (step?.system_prompt_mode || 'generic');

            const res = await fetch('/counselorbot/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage,
                    mode: mode,
                    phase: currentPhase,
                    scores_context: scoresContext,
                    session_id: sessionId,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
            }
        } catch {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Errore di connessione.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const advancePhase = () => {
        const currentIndex = phases.indexOf(currentPhase);
        if (currentIndex < phases.length - 1) {
            setCurrentPhase(phases[currentIndex + 1]);
        }
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
            const response = await fetch('/counselorbot/api/tts', {
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

    const cognitiveScores = Object.entries(scores).filter(([k]) => k.startsWith('C')).sort(([a], [b]) => a.localeCompare(b));
    const affectiveScores = Object.entries(scores).filter(([k]) => k.startsWith('A')).sort(([a], [b]) => a.localeCompare(b));
    const currentColors = getPhaseColors(currentPhase);

    const currentStepIndex = phases.indexOf(currentPhase) + 1;
    const totalSteps = phases.length;

    // Sidebar phases: exclude conclusion from the numbered list
    const sidebarPhases = phases.filter(p => p !== FIXED_CONCLUSION_ID);

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

                    {currentPhase !== FIXED_CONCLUSION_ID && (
                        <button
                            onClick={advancePhase}
                            disabled={isLoading}
                            className="w-full mt-2 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1 disabled:opacity-50 shadow-sm"
                        >
                            {currentPhase === FIXED_QUESTIONS_ID ? 'Concludi Sessione' : 'Prossimo Step'}
                            <ChevronRight className="w-3 h-3" />
                        </button>
                    )}
                </div>

                {/* Scores Display */}
                <div className="glass-panel p-4 rounded-xl space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <BarChart3 className="w-4 h-4" />
                        Punteggi
                    </div>

                    <div className="space-y-1.5">
                        <div className="text-[10px] font-medium text-blue-600 uppercase">Cognitive</div>
                        {cognitiveScores.map(([code, score]) => (
                            <CompactScoreBar key={code} code={code as QSAFactorCode} score={score} />
                        ))}
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                        <div className="text-[10px] font-medium text-purple-600 uppercase">Affettive</div>
                        {affectiveScores.map(([code, score]) => (
                            <CompactScoreBar key={code} code={code as QSAFactorCode} score={score} />
                        ))}
                    </div>
                </div>
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
                                            : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm prose prose-sm max-w-none prose-p:my-1 prose-headings:text-slate-700 prose-headings:font-bold prose-strong:text-slate-900 prose-ul:my-1 prose-li:my-0.5'
                                    )}>
                                        {msg.role === 'assistant' ? (
                                            <ReactMarkdown>{msg.content}</ReactMarkdown>
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
                            onClick={() => window.location.href = '/counselorbot/'}
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
                                {isAnalysisStep(currentPhase) ? "Puoi fare domande sull'analisi corrente oppure cliccare 'Prossimo Step'." : "Fai qualsiasi domanda libera."}
                            </p>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
