'use client';

import { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, GraduationCap, BookOpen, Bot, User, Loader2, FileText } from 'lucide-react';
import { streamChat } from '@/lib/chat-stream';

type Audience = 'studente' | 'docente';

interface Msg {
    role: 'user' | 'assistant';
    content: string;
    sources?: string[];
}

const WELCOME: Record<Audience, string> = {
    studente:
        "Ciao! Sono l'assistente del sito competenzestrategiche.it. "
        + "Posso spiegarti che cosa sono i questionari, a cosa servono e come si svolgono. Cosa vuoi sapere?",
    docente:
        "Benvenuto. Sono l'assistente informativo di competenzestrategiche.it per docenti e formatori. "
        + "Posso fornire informazioni su strumenti, metodologia e uso didattico, basandomi sui materiali del progetto.",
};

// Mostra solo il nome leggibile del file citato.
function sourceLabel(src: string): string {
    const base = src.split('/').pop() || src;
    return base.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
}

export default function AssistentePage() {
    const [audience, setAudience] = useState<Audience>('studente');
    const [messages, setMessages] = useState<Msg[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string | undefined>(undefined);
    const scrollRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        });
    };

    const send = async () => {
        const question = input.trim();
        if (!question || loading) return;
        setInput('');
        setMessages((m) => [...m, { role: 'user', content: question }, { role: 'assistant', content: '' }]);
        setLoading(true);
        scrollToBottom();

        const updateLast = (text: string, sources?: string[]) => {
            setMessages((m) => {
                const next = [...m];
                next[next.length - 1] = { role: 'assistant', content: text, sources };
                return next;
            });
            scrollToBottom();
        };

        try {
            const result = await streamChat(
                { message: question, audience, session_id: sessionId },
                (full) => updateLast(full),
                undefined,
                undefined,
                '/api/site-chat/stream',
            );
            updateLast(result.response, result.sources);
            if (result.session_id) setSessionId(result.session_id);
        } catch (e) {
            updateLast(`⚠️ ${e instanceof Error ? e.message : 'Errore nella risposta.'}`);
        } finally {
            setLoading(false);
        }
    };

    const switchAudience = (a: Audience) => {
        if (a === audience) return;
        setAudience(a);
        setMessages([]);
        setSessionId(undefined);
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-slate-900">Assistente del sito</h1>
                <p className="text-slate-500 mt-1">
                    Domande su competenzestrategiche.it. Le risposte si basano solo sui materiali del progetto.
                </p>
            </div>

            {/* Selettore pubblico */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
                <button
                    onClick={() => switchAudience('studente')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        audience === 'studente' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                >
                    <BookOpen className="w-4 h-4" /> Studente
                </button>
                <button
                    onClick={() => switchAudience('docente')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                        audience === 'docente' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                >
                    <GraduationCap className="w-4 h-4" /> Docente
                </button>
            </div>

            {/* Conversazione */}
            <div ref={scrollRef} className="glass-panel rounded-lg p-4 h-[55vh] overflow-y-auto space-y-4">
                {messages.length === 0 && (
                    <div className="flex items-start gap-3 text-slate-600">
                        <div className="w-8 h-8 rounded-md bg-indigo-50 flex items-center justify-center shrink-0">
                            <Bot className="w-5 h-5 text-indigo-600" />
                        </div>
                        <p className="text-sm leading-relaxed pt-1">{WELCOME[audience]}</p>
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div key={i} className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                            msg.role === 'user' ? 'bg-slate-200' : 'bg-indigo-50'
                        }`}>
                            {msg.role === 'user'
                                ? <User className="w-5 h-5 text-slate-600" />
                                : <Bot className="w-5 h-5 text-indigo-600" />}
                        </div>
                        <div className={`max-w-[80%] rounded-lg px-4 py-2.5 ${
                            msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-800'
                        }`}>
                            {msg.role === 'assistant' && !msg.content
                                ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                                : (
                                    <div className="prose prose-sm max-w-none prose-p:my-1.5 prose-headings:my-2">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                                    </div>
                                )}
                            {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                                <div className="mt-3 pt-2 border-t border-slate-100 flex flex-wrap gap-2">
                                    {msg.sources.map((s) => (
                                        <span key={s} className="inline-flex items-center gap-1 text-xs text-slate-500 bg-slate-50 rounded px-2 py-0.5">
                                            <FileText className="w-3 h-3" /> {sourceLabel(s)}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Input */}
            <div className="flex items-end gap-2">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            send();
                        }
                    }}
                    rows={2}
                    placeholder="Scrivi la tua domanda..."
                    className="flex-1 resize-none rounded-lg border border-slate-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                    onClick={send}
                    disabled={loading || !input.trim()}
                    className="h-12 px-5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2 transition-colors"
                >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
            </div>
        </div>
    );
}
