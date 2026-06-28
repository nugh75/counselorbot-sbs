'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { LucideIcon } from 'lucide-react';
import { Send, GraduationCap, BookOpen, Loader2, FileText, ThumbsUp, ThumbsDown, X, ExternalLink, ShieldAlert, LogIn, ClipboardList, Library, Search } from 'lucide-react';
import { streamChat } from '@/lib/chat-stream';
import { ai4authLoginUrl, getIdentity, type Identity } from '@/lib/auth';
import { canUseAssistant, canUseTeacherAssistant } from '@/lib/roles';
import { useI18n } from '@/lib/i18n-context';
import { fetchAssistantQuestions, type AssistantQuestionsByTopic } from '@/lib/assistant-questions';

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
// Base di conoscenza selezionabile: contenuti del progetto vs piattaforma CounselorBot.
type Collection = 'competenzestrategiche' | 'counselorbot';

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

// I contenuti testuali sono localizzati via i18n: qui restano solo id + icona.
const TOPIC_IDS = ['questionari', 'validazione', 'didattica', 'fonti'] as const;
type TopicId = typeof TOPIC_IDS[number];
const TOPIC_ICONS: Record<TopicId, LucideIcon> = {
    questionari: ClipboardList,
    validazione: Search,
    didattica: GraduationCap,
    fonti: Library,
};

// Mostra solo il nome leggibile del file citato.
function sourceLabel(src: string): string {
    const base = src.split('/').pop() || src;
    return base.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
}

const docUrl = (source: string, collection: string) =>
    `/api/site-chat/document?source=${encodeURIComponent(source)}&collection=${encodeURIComponent(collection)}`;

export default function AssistentePage() {
    const { t, lang } = useI18n();
    const [identity, setIdentity] = useState<Identity | null | undefined>(undefined);
    const [audience, setAudience] = useState<Audience>('studente');
    const [collection, setCollection] = useState<Collection>('competenzestrategiche');
    const [messages, setMessages] = useState<Msg[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string | undefined>(undefined);
    const [preview, setPreview] = useState<PreviewState | null>(null);
    const [selectedTopicId, setSelectedTopicId] = useState<TopicId>(TOPIC_IDS[0]);
    const scrollRef = useRef<HTMLDivElement>(null);
    // Domande suggerite dal DB (gestite da admin), per topic; per le lingue senza
    // righe si ricade sulle varianti i18n.
    const [dbQuestions, setDbQuestions] = useState<AssistantQuestionsByTopic>({});
    // Indice della prossima domanda per topic: "Prepara domanda" scorre la lista
    // cosi' propone ogni volta una domanda diversa invece di ripetere la stessa.
    const questionVariantIdx = useRef<Record<string, number>>({});

    const topics = TOPIC_IDS.map((id) => ({
        id,
        icon: TOPIC_ICONS[id],
        title: t(`assistant.topic.${id}.title`),
        body: t(`assistant.topic.${id}.body`),
        prompt: t(`assistant.topic.${id}.prompt`),
    }));
    const selectedTopic = topics.find((x) => x.id === selectedTopicId) ?? topics[0];

    useEffect(() => {
        getIdentity().then((id) => {
            setIdentity(id);
            setAudience(canUseTeacherAssistant(id) ? 'docente' : 'studente');
        });
    }, []);

    // Carica le domande suggerite dal DB per la lingua corrente; reset del cursore.
    useEffect(() => {
        let active = true;
        fetchAssistantQuestions(lang).then((data) => {
            if (active) {
                setDbQuestions(data);
                questionVariantIdx.current = {};
            }
        });
        return () => { active = false; };
    }, [lang]);

    const scrollToBottom = () => {
        requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        });
    };

    const prepareQuestion = () => {
        // Preferisci le domande dal DB (gestite da admin); fallback alle varianti i18n.
        const fromDb = dbQuestions[selectedTopic.id] ?? [];
        const variants = fromDb.length > 0
            ? fromDb
            : selectedTopic.prompt.split('|||').map((s) => s.trim()).filter(Boolean);
        if (variants.length === 0) return;
        const i = questionVariantIdx.current[selectedTopic.id] ?? 0;
        setInput(variants[i % variants.length]);
        questionVariantIdx.current[selectedTopic.id] = (i + 1) % variants.length;
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
                { message: question, audience, session_id: sessionId, language: lang, collection },
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
            updateLast(t('assistant.error', { message: e instanceof Error ? e.message : t('assistant.errorGeneric') }));
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
                    language: lang,
                    helpful,
                }),
            });
        } catch (e) {
            console.error('Feedback non inviato', e);
        }
    };

    const openPreview = async (source: string) => {
        const isPdf = source.toLowerCase().endsWith('.pdf');
        setPreview({ source, title: sourceLabel(source), kind: isPdf ? 'pdf' : 'markdown', loading: !isPdf });
        if (isPdf) return;
        try {
            const res = await fetch(docUrl(source, collection));
            if (!res.ok) throw new Error(t('assistant.previewUnavailable', { status: res.status }));
            const data = await res.json();
            setPreview({ source, title: data.title || sourceLabel(source), kind: 'markdown', content: data.content, loading: false });
        } catch (e) {
            setPreview({ source, title: sourceLabel(source), kind: 'markdown', loading: false, error: e instanceof Error ? e.message : t('assistant.errorShort') });
        }
    };

    const chooseTopic = (topicId: TopicId) => {
        setSelectedTopicId(topicId);
        setAudience(canUseTeacherAssistant(identity) ? 'docente' : 'studente');
        setMessages([]);
        setSessionId(undefined);
        setPreview(null);
    };

    // Cambio base di conoscenza: azzera la conversazione (contesto diverso).
    const chooseCollection = (next: Collection) => {
        if (next === collection) return;
        setCollection(next);
        setMessages([]);
        setSessionId(undefined);
        setPreview(null);
    };

    if (identity === undefined) {
        return (
            <div className="page-narrow">
                <div className="glass-panel p-8 text-center text-sm text-slate-500">{t('assistant.loadingAccess')}</div>
            </div>
        );
    }

    if (!identity?.authenticated) {
        return (
            <div className="page-narrow">
                <div className="glass-panel p-8 text-center space-y-5">
                    <ShieldAlert className="mx-auto h-10 w-10 text-indigo-600" />
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">{t('assistant.authTitle')}</h1>
                        <p className="mt-2 text-sm text-slate-600">{t('assistant.authBody')}</p>
                    </div>
                    <a href={ai4authLoginUrl('/assistente')} className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700">
                        <LogIn className="h-4 w-4" />
                        {t('assistant.authLogin')}
                    </a>
                </div>
            </div>
        );
    }

    if (!canUseAssistant(identity)) {
        return (
            <div className="page-narrow">
                <div className="glass-panel p-8 text-center space-y-4">
                    <ShieldAlert className="mx-auto h-10 w-10 text-amber-600" />
                    <h1 className="text-2xl font-bold text-slate-900">{t('assistant.deniedTitle')}</h1>
                    <p className="text-sm text-slate-600">{t('assistant.deniedBody')}</p>
                </div>
            </div>
        );
    }

    const SelectedTopicIcon = selectedTopic.icon;

    return (
        <div className="h-[calc(100vh-4rem)] flex flex-col">
            {/* Layout a due colonne: quadrati a sinistra, chat a destra */}
            <div className="flex-1 flex flex-col lg:flex-row gap-6 overflow-hidden p-6">
                {/* Colonna sinistra: quadrati/topic e info topic selezionato - scrollabile */}
                <div className="w-full lg:w-80 shrink-0 flex flex-col gap-4 overflow-y-auto">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">{t('assistant.title')}</h1>
                        <p className="text-slate-500 mt-1 text-sm">
                            {t('assistant.subtitle')}
                        </p>
                    </div>

                    {/* Selettore base di conoscenza: progetto vs piattaforma CounselorBot. */}
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1.5">
                            {t('assistant.collection.label')}
                        </p>
                        <div className="grid grid-cols-2 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                            {(['competenzestrategiche', 'counselorbot'] as Collection[]).map((c) => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => chooseCollection(c)}
                                    className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                                        collection === c
                                            ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-indigo-200'
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    {t(`assistant.collection.${c}`)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
                        {topics.map((topic) => {
                            const Icon = topic.icon;
                            const active = selectedTopic.id === topic.id;
                            return (
                                <button
                                    key={topic.id}
                                    type="button"
                                    onClick={() => chooseTopic(topic.id)}
                                    className={`rounded-lg border p-3 text-left transition-colors ${
                                        active ? 'border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200' : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50'
                                    }`}
                                >
                                    <Icon className={`h-5 w-5 ${active ? 'text-indigo-700' : 'text-slate-500'}`} />
                                    <h2 className="mt-2 text-sm font-bold text-slate-900">{topic.title}</h2>
                                    <p className="mt-1 text-xs leading-relaxed text-slate-500 line-clamp-2">{topic.body}</p>
                                </button>
                            );
                        })}
                    </div>

                    <div className="glass-panel p-4 flex flex-col gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-indigo-50 text-indigo-600">
                            <SelectedTopicIcon className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="font-bold text-slate-900">{selectedTopic.title}</h2>
                            <p className="mt-1 text-sm leading-relaxed text-slate-600">{selectedTopic.body}</p>
                        </div>
                        <button
                            type="button"
                            onClick={prepareQuestion}
                            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            <BookOpen className="h-4 w-4" />
                            {t('assistant.prepareQuestion')}
                        </button>
                    </div>
                </div>

                {/* Colonna destra: chat - prende tutto lo spazio rimanente */}
                <div className="flex-1 min-w-0 flex flex-col gap-4 overflow-hidden">
                    <div ref={scrollRef} className="glass-panel p-4 flex-1 overflow-y-auto space-y-4">
                        {messages.length === 0 && (
                            <div className="flex items-start gap-3 text-slate-600">
                                <p className="text-sm leading-relaxed pt-1">{t(`assistant.welcome.${audience}`)}</p>
                            </div>
                        )}

                        {messages.map((msg, i) => (
                            <div key={i} className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
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
                                                    title={t('assistant.openPreview', { name: sourceLabel(s) })}
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
                                                title={t('assistant.feedbackUp')}
                                                className={`p-1 rounded transition-colors disabled:cursor-default ${
                                                    msg.feedback === true ? 'text-green-600' : 'text-slate-400 hover:text-green-600'
                                                }`}
                                            >
                                                <ThumbsUp className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => submitFeedback(i, false)}
                                                disabled={msg.feedback !== undefined}
                                                title={t('assistant.feedbackDown')}
                                                className={`p-1 rounded transition-colors disabled:cursor-default ${
                                                    msg.feedback === false ? 'text-red-600' : 'text-slate-400 hover:text-red-600'
                                                }`}
                                            >
                                                <ThumbsDown className="w-4 h-4" />
                                            </button>
                                            {msg.feedback !== undefined && (
                                                <span className="text-xs text-slate-400 ml-1">{t('assistant.feedbackThanks')}</span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Input */}
                    <div className="flex items-end gap-2 shrink-0">
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
                            placeholder={t('assistant.inputPlaceholder')}
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
                                href={docUrl(preview.source, collection)}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={t('assistant.previewNewTab')}
                                className="p-1 text-slate-400 hover:text-indigo-600 transition-colors"
                            >
                                <ExternalLink className="w-4 h-4" />
                            </a>
                            <button
                                onClick={() => setPreview(null)}
                                title={t('assistant.previewClose')}
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
                                    src={docUrl(preview.source, collection)}
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
