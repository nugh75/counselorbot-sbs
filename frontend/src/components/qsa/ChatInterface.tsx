'use client';

import { Send, Bot, ChevronDown } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { QSAFactorCode, QSA_FACTORS, analyzeScore } from '@/lib/qsa-model';
import ReactMarkdown from 'react-markdown';

type AnalysisMode = 'factor' | 'second-level' | 'generic';

interface ChatInterfaceProps {
    currentMode: string;
    onModeChange: (mode: string) => void;
    scores?: Record<QSAFactorCode, number> | null;
}

// Helper to format scores for display
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

export function ChatInterface({ currentMode, onModeChange, scores }: ChatInterfaceProps) {
    const [messages, setMessages] = useState([
        { role: 'assistant', content: 'Ciao! Ho analizzato il tuo profilo QSA. Da dove vuoi iniziare?' }
    ]);
    const [input, setInput] = useState('');
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const modes: { id: AnalysisMode; label: string }[] = [
        { id: 'factor', label: 'Analisi Fattore per Fattore' },
        { id: 'second-level', label: 'Analisi Secondo Livello' },
        { id: 'generic', label: 'Domande Generali' },
    ];

    const currentLabel = modes.find(m => m.id === currentMode)?.label || 'Seleziona Modalità';

    const [isLoading, setIsLoading] = useState(false);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage = input;
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setInput('');
        setIsLoading(true);

        try {
            // Include scores context in the message
            const scoresContext = scores ? formatScoresForPrompt(scores) : '';

            const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage,
                    mode: currentMode,
                    scores_context: scoresContext
                }),
            });

            if (!res.ok) {
                throw new Error('Errore nella risposta del server');
            }

            const data = await res.json();
            setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
        } catch (error) {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: '❌ Errore di connessione al backend. Assicurati che il server sia attivo su porta 8000.'
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleModeSwitch = (modeId: string) => {
        onModeChange(modeId);
        setIsMenuOpen(false);
        setMessages(prev => [...prev, {
            role: 'system',
            content: `Modalità cambiata in: ${modes.find(m => m.id === modeId)?.label}`
        }]);
    };

    return (
        <div className="flex flex-col h-[600px] bg-white rounded-2xl overflow-hidden border border-slate-200 shadow-sm relative">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between z-20 relative">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shadow-sm">
                        <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-sm text-slate-800">CounselorBot AI</h3>
                        <p className="text-xs text-blue-600">Online • QSA Expert</p>
                    </div>
                </div>

                {/* Mode Switcher */}
                <div className="relative">
                    <button
                        onClick={() => setIsMenuOpen(!isMenuOpen)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-xs font-medium text-slate-700 transition-colors shadow-sm"
                    >
                        {currentLabel}
                        <ChevronDown className="w-3 h-3 text-slate-400" />
                    </button>

                    {isMenuOpen && (
                        <div className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-white border border-slate-200 overflow-hidden shadow-xl animate-fade-in-up z-50">
                            {modes.map((mode) => (
                                <button
                                    key={mode.id}
                                    onClick={() => handleModeSwitch(mode.id)}
                                    className={cn(
                                        "w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors flex items-center gap-2",
                                        currentMode === mode.id ? "bg-blue-50 text-blue-600 font-medium" : "text-slate-600"
                                    )}
                                >
                                    {mode.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : msg.role === 'system' ? 'justify-center' : 'justify-start'}`}>
                        {msg.role === 'system' ? (
                            <span className="text-xs text-slate-500 py-2 px-3 rounded-full bg-slate-100 border border-slate-200">
                                {msg.content}
                            </span>
                        ) : (
                            <div className={`
                                max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm
                                ${msg.role === 'user'
                                    ? 'bg-blue-600 text-white rounded-tr-sm'
                                    : 'bg-white border border-slate-100 text-slate-800 rounded-tl-sm prose prose-sm prose-slate max-w-none'}
                            `}>
                                {msg.role === 'assistant' ? (
                                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                                ) : (
                                    msg.content
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="p-4 border-t border-slate-100 bg-white">
                <div className="relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Scrivi un messaggio..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-full px-5 py-3 pr-12 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-slate-400"
                    />
                    <button
                        type="submit"
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </form>
        </div>
    );
}
