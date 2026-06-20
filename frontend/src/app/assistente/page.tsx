'use client';

import { useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, GraduationCap, BookOpen, Bot, User, Loader2, FileText, ThumbsUp, ThumbsDown, X, ExternalLink } from 'lucide-react';
import { streamChat } from '@/lib/chat-stream';

// Tabelle con bordi + scroll orizzontale per una lettura pulita dei documenti.
const mdComponents: Components = {
    table: (props) => (
        <div className="overflow-x-auto my-3">
            <table {...props} className="w-full border-collapse text-xs" />
        </div>
    ),
    th: (props) => <th {...props} className="border border-slate-300 bg-slate-50 px-2 py-1 text-left font-semibold" />,
    td: (props) => <td {...props} className="border border-slate-200 px-2 py-1 align-top" />,
};

type Audience = 'studente' | 'docente';

interface Msg {
    role: 'user' | 'assistant';
    content: string;
    sources?: string[];
    responseId?: string;
    feedback?: boolean;       // true=positivo, false=negativo, undefined=non votato
    audience?: Audience;      // pubblico al momento della risposta
}

interface PreviewState {
    source: string;
    title: string;
    kind: 'pdf' | 'markdown';
    content?: string;
    loading: boolean;
    error?: string;
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

const docUrl = (source: string) => `/api/site-chat/document?source=${encodeURIComponent(source)}`;

export default function AssistentePage() {
    const [audience, setAudience] = useState<Audience>('studente');
    const [messages, setMessages] = useState<Msg[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string | undefined>(undefined);
    const [preview, setPreview] = useState<PreviewState | null>(null);
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
            setMessages((m) => {
                const next = [...m];
                next[next.length - 1] = {
                    role: 'assistant',
                    content: result.response,
                    sources: result.sources,
                    responseId: result.response_id,
                    audience,
                };
                return next;
            });
            if (result.session_id) setSessionId(result.session_id);
        } catch (e) {
            updateLast(`Errore: ${e instanceof Error ? e.message : 'Errore nella risposta.'}`);
        } finally {
            setLoading(false);
        }
    };

    const submitFeedback = async (index: number, helpful: boolean) => {
        const msg = messages[index];
        if (!msg?.responseId || msg.feedback !== undefined) return;
        setMessages((m) => m.map((it, i) => (i === index ? { ...it, feedback: helpful } : it)));
        try {
            await fetch('/api/strategy-feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    response_id: msg.responseId,
                    strategy_ids: [],
                    questionnaire_type: 'SITE',
                    phase: msg.audience || audience,
                    language: 'it',
                    helpful,
                }),
            });
        } catch (e) {
            console.error('Feedback non inviato', e);
        }
    };

    const openPreview = async (source: string) => {
        const isPdf = source.toLowerCase().endsWith('.pdf');
        // PDF: caricato direttamente dall'iframe. Markdown: fetch del contenuto.
        setPreview({ source, title: sourceLabel(source), kind: isPdf ? 'pdf' : 'markdown', loading: !isPdf });
        if (isPdf) return;
        try {
            const res = await fetch(docUrl(source));
            if (!res.ok) throw new Error(`Anteprima non disponibile (${res.status})`);
            const data = await res.json();
            setPreview({ source, title: data.title || sourceLabel(source), kind: 'markdown', content: data.content, loading: false });
        } catch (e) {
            setPreview({ source, title: sourceLabel(source), kind: 'markdown', loading: false, error: e instanceof Error ? e.message : 'Errore' });
        }
    };

    const switchAudience = (a: Audience) => {
        if (a === audience) return;
        setAudience(a);
        setMessages([]);
        setSessionId(undefined);
        setPreview(null);
    };

    return (
        <div className="page-wide space-y-6">
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

            <div className="flex flex-col lg:flex-row gap-6 items-stretch">
                {/* Colonna chat */}
                <div className={`flex-1 min-w-0 space-y-4 ${preview ? '' : 'w-full lg:max-w-3xl lg:mx-auto'}`}>
                    <div ref={scrollRef} className="glass-panel p-4 h-chat overflow-y-auto space-y-4">
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
                                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{msg.content}</ReactMarkdown>
                                            </div>
                                        )}
                                    {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                                        <div className="mt-3 pt-2 border-t border-slate-100 flex flex-wrap gap-2">
                                            {msg.sources.map((s) => (
                                                <button
                                                    key={s}
                                                    onClick={() => openPreview(s)}
                                                    title={`Apri anteprima: ${sourceLabel(s)}`}
                                                    className={`inline-flex items-center gap-1 text-xs rounded px-2 py-0.5 transition-colors ${
                                                        preview?.source === s
                                                            ? 'bg-indigo-100 text-indigo-700'
                                                            : 'bg-slate-50 text-slate-500 hover:bg-indigo-50 hover:text-indigo-600'
                                                    }`}
                                                >
                                                    <FileText className="w-3 h-3" /> {sourceLabel(s)}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {msg.role === 'assistant' && msg.responseId && (
                                        <div className="mt-2 flex items-center gap-1">
                                            <button
                                                onClick={() => submitFeedback(i, true)}
                                                disabled={msg.feedback !== undefined}
                                                title="Risposta utile"
                                                className={`p-1 rounded transition-colors disabled:cursor-default ${
                                                    msg.feedback === true ? 'text-green-600' : 'text-slate-400 hover:text-green-600'
                                                }`}
                                            >
                                                <ThumbsUp className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => submitFeedback(i, false)}
                                                disabled={msg.feedback !== undefined}
                                                title="Risposta poco utile"
                                                className={`p-1 rounded transition-colors disabled:cursor-default ${
                                                    msg.feedback === false ? 'text-red-600' : 'text-slate-400 hover:text-red-600'
                                                }`}
                                            >
                                                <ThumbsDown className="w-4 h-4" />
                                            </button>
                                            {msg.feedback !== undefined && (
                                                <span className="text-xs text-slate-400 ml-1">Grazie!</span>
                                            )}
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

                {/* Pannello anteprima documento */}
                {preview && (
                    <aside className="w-full lg:w-[460px] shrink-0 glass-panel flex flex-col h-[calc(var(--chat-h)+4.5rem)]">
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200">
                            <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                            <span className="text-sm font-semibold text-slate-800 truncate flex-1" title={preview.title}>
                                {preview.title}
                            </span>
                            <a
                                href={docUrl(preview.source)}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Apri in una nuova scheda"
                                className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                            >
                                <ExternalLink className="w-4 h-4" />
                            </a>
                            <button
                                onClick={() => setPreview(null)}
                                title="Chiudi anteprima"
                                className="p-1 text-slate-400 hover:text-slate-700 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex-1 min-h-0 overflow-hidden">
                            {preview.loading && (
                                <div className="h-full flex items-center justify-center text-slate-400">
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                </div>
                            )}
                            {preview.error && (
                                <div className="p-4 text-sm text-red-600">{preview.error}</div>
                            )}
                            {!preview.loading && !preview.error && preview.kind === 'pdf' && (
                                <iframe
                                    src={docUrl(preview.source)}
                                    title={preview.title}
                                    className="w-full h-full border-0"
                                />
                            )}
                            {!preview.loading && !preview.error && preview.kind === 'markdown' && (
                                <div className="h-full overflow-y-auto p-4">
                                    <div className="prose prose-sm max-w-none">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{preview.content || ''}</ReactMarkdown>
                                    </div>
                                </div>
                            )}
                        </div>
                    </aside>
                )}
            </div>
        </div>
    );
}
