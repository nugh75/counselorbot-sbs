'use client';

import { Send, Bot, ChevronRight, CheckCircle2, Loader2, BarChart3, Volume2, Square, Home } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { QSAFactorCode, QSA_FACTORS, analyzeScore } from '@/lib/qsa-model';
import ReactMarkdown from 'react-markdown';
import { useRouter } from 'next/navigation';

type Phase =
    | 'cognitive'
    | 'affective'
    | 'sl-elaboration'      // 1. Elaborazione e Organizzazione
    | 'sl-selfcontrol'      // 2. Autocontrollo e Concentrazione
    | 'sl-motivation'       // 3. Motivazione e Volontà
    | 'sl-emotions'         // 4. Gestione Emotiva
    | 'sl-attribution'      // 5. Stile Attributivo
    | 'sl-social'           // 6. Dimensione Sociale
    | 'questions'           // 4. Domande (renamed from general)
    | 'conclusion';

interface GuidedChatInterfaceProps {
    scores: Record<QSAFactorCode, number>;
    onComplete: () => void;
    sessionId: string;
}

const INVERTED_FACTORS: QSAFactorCode[] = ['C3', 'C6', 'A1', 'A4', 'A5', 'A7'];

const PHASE_CONFIG: Record<Phase, { label: string; headerBg: string; iconBg: string; promptMode: string; promptText?: string }> = {
    'cognitive': {
        label: '1. Fattori Cognitivi',
        headerBg: 'bg-blue-50',
        iconBg: 'bg-blue-500',
        promptMode: 'factor',
        promptText: 'Analizza SOLO i fattori COGNITIVI (C1-C7) del mio profilo QSA. Per ciascuno dai il punteggio, interpretazione e breve commento.'
    },
    'affective': {
        label: '2. Fattori Affettivi',
        headerBg: 'bg-purple-50',
        iconBg: 'bg-purple-500',
        promptMode: 'factor',
        promptText: 'Analizza SOLO i fattori AFFETTIVI (A1-A7) del mio profilo QSA. Per ciascuno dai il punteggio, interpretazione e breve commento.'
    },
    'sl-elaboration': {
        label: '3.1 Elaborazione e Org.',
        headerBg: 'bg-indigo-50',
        iconBg: 'bg-indigo-500',
        promptMode: 'second-level',
        promptText: 'Analisi 2° Livello - Parte 1: ELABORAZIONE E ORGANIZZAZIONE. Analizza insieme i fattori: C1 (Strategie elaborative), C5 (Organizzatori semantici), C7 (Autointerrogazione). Valuta come lo studente processa e struttura le informazioni.'
    },
    'sl-selfcontrol': {
        label: '3.2 Autocontrollo',
        headerBg: 'bg-indigo-50',
        iconBg: 'bg-indigo-500',
        promptMode: 'second-level',
        promptText: 'Analisi 2° Livello - Parte 2: AUTOCONTROLLO E CONCENTRAZIONE. Analizza insieme i fattori: C2 (Autoregolazione), C3 (Disorientamento), C6 (Difficoltà concentrazione). Valuta la capacità di gestire il processo di studio.'
    },
    'sl-motivation': {
        label: '3.3 Motivazione',
        headerBg: 'bg-pink-50',
        iconBg: 'bg-pink-500',
        promptMode: 'second-level',
        promptText: 'Analisi 2° Livello - Parte 3: MOTIVAZIONE E VOLONTÀ. Analizza insieme i fattori: A2 (Volizione), A5 (Mancanza perseveranza), A6 (Percezione competenza). Valuta la spinta motivazionale e la fiducia in se stessi.'
    },
    'sl-emotions': {
        label: '3.4 Gestione Emotiva',
        headerBg: 'bg-pink-50',
        iconBg: 'bg-pink-500',
        promptMode: 'second-level',
        promptText: 'Analisi 2° Livello - Parte 4: GESTIONE EMOTIVA. Analizza insieme i fattori: A1 (Ansietà di base), A7 (Interferenze emotive). Valuta la capacità di gestire stress ed emozioni negative.'
    },
    'sl-attribution': {
        label: '3.5 Stile Attributivo',
        headerBg: 'bg-orange-50',
        iconBg: 'bg-orange-500',
        promptMode: 'second-level',
        promptText: 'Analisi 2° Livello - Parte 5: STILE ATTRIBUTIVO. Analizza insieme i fattori: A3 (Attribuzione controllabile), A4 (Attribuzione incontrollabile). Valuta come lo studente interpreta successi e insuccessi.'
    },
    'sl-social': {
        label: '3.6 Dimensione Sociale',
        headerBg: 'bg-teal-50',
        iconBg: 'bg-teal-500',
        promptMode: 'second-level',
        promptText: 'Analisi 2° Livello - Parte 6: DIMENSIONE SOCIALE. Analizza il fattore C4 (Collaborazione). Valuta la propensione al lavoro di gruppo.'
    },
    'questions': {
        label: '4. Domande e Approfondimenti',
        headerBg: 'bg-green-50',
        iconBg: 'bg-green-500',
        promptMode: 'generic'
    },
    'conclusion': {
        label: 'Conclusione',
        headerBg: 'bg-slate-50',
        iconBg: 'bg-slate-500',
        promptMode: 'generic'
    },
};

const PHASE_ORDER: Phase[] = [
    'cognitive', 'affective',
    'sl-elaboration', 'sl-selfcontrol', 'sl-motivation', 'sl-emotions', 'sl-attribution', 'sl-social',
    'questions', 'conclusion'
];

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

export function GuidedChatInterface({ scores, onComplete, sessionId }: GuidedChatInterfaceProps) {
    const router = useRouter();
    const [currentPhase, setCurrentPhase] = useState<Phase>('cognitive');
    const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [playingMessageIdx, setPlayingMessageIdx] = useState<number | null>(null);
    const [isAudioLoading, setIsAudioLoading] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const lastProcessedPhase = useRef<Phase | null>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Cleanup audio on unmount
    useEffect(() => {
        return () => {
            if (audioRef.current) {
                audioRef.current.pause();
            }
        };
    }, []);

    // Initial trigger and Phase changes
    useEffect(() => {
        if (lastProcessedPhase.current === currentPhase) return;
        lastProcessedPhase.current = currentPhase;

        const config = PHASE_CONFIG[currentPhase];

        if (currentPhase === 'questions') {
            setMessages(prev => [...prev, {
                role: 'system',
                content: '--- Fase 4: Domande e Approfondimenti ---'
            }, {
                role: 'assistant',
                content: 'Abbiamo completato l\'analisi strutturata. Ora puoi farmi qualsiasi domanda libera sul tuo metodo di studio, sui risultati o chiedere consigli specifici.'
            }]);
        } else if (currentPhase === 'conclusion') {
            // Conclusion is just a state to show the exit button, no auto-generation needed per se, 
            // but we can add a closing message.
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Hai completato il percorso di analisi del QSA. Spero ti sia stato utile! Clicca sul pulsante in basso per tornare alla Home Page.'
            }]);
        } else {
            // Auto-generate analysis for structured phases
            if (config.promptText) {
                generateAnalysis(config.promptText, config.promptMode);
            }
        }
    }, [currentPhase]);

    const generateAnalysis = async (prompt: string, mode: string) => {
        setIsLoading(true);
        // Add a separator for readability in history
        if (messages.length > 0) {
            setMessages(prev => [...prev, { role: 'system', content: `--- ${PHASE_CONFIG[currentPhase].label} ---` }]);
        }

        try {
            const scoresContext = formatScoresForPrompt(scores);
            const res = await fetch('http://localhost:8000/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: prompt,
                    mode: mode,
                    scores_context: scoresContext,
                    session_id: sessionId
                }),
            });

            if (res.ok) {
                const data = await res.json();
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: data.response
                }]);
            } else {
                setMessages(prev => [...prev, { role: 'assistant', content: 'Errore durante l\'analisi.' }]);
            }
        } catch (error) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Errore di connessione.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage = input;
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setInput('');
        setIsLoading(true);

        try {
            const scoresContext = formatScoresForPrompt(scores);
            // In questions phase, use generic mode. In others, stick to the phase context (though usually user just reads in analysis phases)
            // Ideally, user reads analysis, clicks "Next". But if they ask a question during analysis, we answer in that context.
            const mode = currentPhase === 'questions' ? 'generic' : PHASE_CONFIG[currentPhase].promptMode;

            const res = await fetch('http://localhost:8000/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage,
                    mode: mode,
                    scores_context: scoresContext,
                    session_id: sessionId
                }),
            });

            if (res.ok) {
                const data = await res.json();
                setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
            }
        } catch (error) {
            setMessages(prev => [...prev, { role: 'assistant', content: 'Errore di connessione.' }]);
        } finally {
            setIsLoading(false);
        }
    };

    const advancePhase = () => {
        const currentIndex = PHASE_ORDER.indexOf(currentPhase);
        if (currentIndex < PHASE_ORDER.length - 1) {
            setCurrentPhase(PHASE_ORDER[currentIndex + 1]);
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
            const response = await fetch('http://localhost:8000/tts', {
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

    const cognitiveScores = Object.entries(scores).filter(([k]) => k.startsWith('C')).sort(([a], [b]) => a.localeCompare(b));
    const affectiveScores = Object.entries(scores).filter(([k]) => k.startsWith('A')).sort(([a], [b]) => a.localeCompare(b));
    const currentConfig = PHASE_CONFIG[currentPhase];

    // Simple step progress calculation
    const currentStepIndex = PHASE_ORDER.indexOf(currentPhase) + 1;
    const totalSteps = PHASE_ORDER.length;

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
                        {PHASE_ORDER.slice(0, -1).map((phaseId, idx) => { // Exclude 'conclusion' from list if desired, or keep it.
                            const pConfig = PHASE_CONFIG[phaseId];
                            const isActive = currentPhase === phaseId;
                            const isDone = PHASE_ORDER.indexOf(currentPhase) > idx;

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
                                    <span className="truncate">{pConfig.label}</span>
                                </div>
                            )
                        })}
                    </div>

                    {/* Advance Button (Available in all phases except Conclusion) */}
                    {currentPhase !== 'conclusion' && (
                        <button
                            onClick={advancePhase}
                            disabled={isLoading}
                            className="w-full mt-2 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1 disabled:opacity-50 shadow-sm"
                        >
                            {currentPhase === 'questions' ? 'Concludi Sessione' : 'Prossimo Step'}
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
                <div className={cn("p-4 border-b border-slate-100 flex items-center gap-3", currentConfig.headerBg)}>
                    <div className={cn("w-10 h-10 rounded-full flex items-center justify-center shadow-sm", currentConfig.iconBg)}>
                        <Bot className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-800">CounselorBot AI</h3>
                        <p className="text-xs text-slate-500 font-medium">{currentConfig.label}</p>
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

                    {/* Loading Indicator */}
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
                {currentPhase === 'conclusion' ? (
                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-center">
                        <button
                            onClick={() => router.push('/')}
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
                                {currentPhase !== 'questions' ? "Puoi fare domande sull'analisi corrente oppure cliccare 'Prossimo Step'." : "Fai qualsiasi domanda libera."}
                            </p>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
