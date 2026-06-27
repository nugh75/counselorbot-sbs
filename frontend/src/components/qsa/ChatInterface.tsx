'use client';

import { Send, Bot, ChevronDown } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { QSAFactorCode, QSA_FACTORS, analyzeScore } from '@/lib/qsa-model';
import { streamChat } from '@/lib/chat-stream';
import { getSelectedCounselorId } from '@/lib/counselor';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useI18n } from '@/lib/i18n-context';

type AnalysisMode = 'factor' | 'second-level' | 'generic';

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

interface ChatInterfaceProps {
    currentMode: string;
    onModeChange: (mode: string) => void;
    scores?: Record<QSAFactorCode, number> | null;
}

// Helper to format scores for display
function formatScoresForPrompt(
    scores: Record<QSAFactorCode, number>,
    factorName: (code: QSAFactorCode, fallback: string) => string,
): string {
    const lines: string[] = ['PROFILO QSA DELLO STUDENTE:'];

    lines.push('\nStrategie Cognitive:');
    Object.entries(scores).filter(([k]) => k.startsWith('C')).forEach(([code, value]) => {
        const factor = QSA_FACTORS[code as QSAFactorCode];
        const analysis = analyzeScore(code as QSAFactorCode, value);
        lines.push(`- ${code} (${factorName(code as QSAFactorCode, factor.name)}): ${value}/9 (${analysis.interpretation})`);
    });

    lines.push('\nStrategie Affettive:');
    Object.entries(scores).filter(([k]) => k.startsWith('A')).forEach(([code, value]) => {
        const factor = QSA_FACTORS[code as QSAFactorCode];
        const analysis = analyzeScore(code as QSAFactorCode, value);
        lines.push(`- ${code} (${factorName(code as QSAFactorCode, factor.name)}): ${value}/9 (${analysis.interpretation})`);
    });

    return lines.join('\n');
}

export function ChatInterface({ currentMode, onModeChange, scores }: ChatInterfaceProps) {
    const { t, tf, lang } = useI18n();
    const [messages, setMessages] = useState([
        { role: 'assistant', content: t('chat.initial') }
    ]);
    const [input, setInput] = useState('');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const requestRef = useRef<AbortController | null>(null);

    useEffect(() => () => requestRef.current?.abort(), []);

    const modes: { id: AnalysisMode; label: string }[] = [
        { id: 'factor', label: t('mode.factor.title') },
        { id: 'second-level', label: t('mode.second-level.title') },
        { id: 'generic', label: t('mode.generic.title') },
    ];

    const currentLabel = modes.find(m => m.id === currentMode)?.label || t('mode.select');

    const [isLoading, setIsLoading] = useState(false);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage = input;
        setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
        setInput('');
        setIsLoading(true);
        requestRef.current?.abort();
        const controller = new AbortController();
        requestRef.current = controller;

        // Placeholder dell'assistente che verrà riempito man mano (streaming)
        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
        const updateLast = (content: string) => {
            setMessages(prev => {
                const copy = [...prev];
                copy[copy.length - 1] = { role: 'assistant', content };
                return copy;
            });
        };

        try {
            // Include scores context in the message
            const scoresContext = scores
                ? formatScoresForPrompt(scores, (code, fallback) => tf(`factor.${code}.name`, fallback))
                : '';

            const { response } = await streamChat(
                { message: userMessage, mode: currentMode, scores_context: scoresContext, questionnaire_type: 'QSA', language: lang, counselor_id: getSelectedCounselorId() },
                (full) => updateLast(full),
                controller.signal,
            );
            updateLast(response);
        } catch {
            if (controller.signal.aborted) return;
            updateLast(t('chat.connectionError'));
        } finally {
            if (requestRef.current === controller) {
                requestRef.current = null;
                setIsLoading(false);
            }
        }
    };

    const handleModeSwitch = (modeId: string) => {
        onModeChange(modeId);
        setIsMenuOpen(false);
        setMessages(prev => [...prev, {
            role: 'system',
            content: t('chat.switch', { mode: modes.find(m => m.id === modeId)?.label || modeId })
        }]);
    };

    return (
        <div className="flex flex-col h-[600px] bg-white rounded-lg overflow-hidden border border-slate-200 shadow-sm relative">
            {/* Header */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between z-20 relative">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-indigo-600 flex items-center justify-center shadow-sm">
                        <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-sm text-slate-800">CounselorBot AI</h3>
                        <p className="text-xs text-indigo-600">{t('chat.online')}</p>
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
                        <div className="absolute right-0 top-full mt-2 w-56 rounded-md bg-white border border-slate-200 overflow-hidden shadow-xl animate-fade-in-up z-50">
                            {modes.map((mode) => (
                                <button
                                    key={mode.id}
                                    onClick={() => handleModeSwitch(mode.id)}
                                    className={cn(
                                        "w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors flex items-center gap-2",
                                        currentMode === mode.id ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-600"
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
                                max-w-[80%] px-4 py-3 rounded-lg text-sm leading-relaxed shadow-sm
                                ${msg.role === 'user'
                                    ? 'bg-indigo-600 text-white rounded-tr-sm'
                                    : 'bg-white border border-slate-100 text-slate-800 rounded-tl-sm'}
                            `}>
                                {msg.role === 'assistant' ? (
                                    <div className="overflow-x-auto rounded-lg border border-slate-200/80 bg-white">
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={markdownComponents}
                                        >
                                            {msg.content}
                                        </ReactMarkdown>
                                    </div>
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
                        placeholder={t('chat.placeholder')}
                        className="w-full bg-slate-50 border border-slate-200 rounded-md px-4 py-3 pr-12 text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none placeholder:text-slate-400"
                    />
                    <button
                        type="submit"
                        aria-label={t('chat.send')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            </form>
        </div>
    );
}
