'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { LucideIcon } from 'lucide-react';
import { Send, Square, GraduationCap, BookOpen, Loader2, FileText, ThumbsUp, ThumbsDown, X, ExternalLink, ShieldAlert, LogIn, ClipboardList, Library, Search, Award, Eye, Users, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { ChatContinuation, useChatContinuation } from '@/components/ui/ChatContinuation';
import { ai4authLoginUrl, getIdentity, getViewAsAccount, type Identity } from '@/lib/auth';
import { canUseAssistant, canUseTeacherAssistant } from '@/lib/roles';
import { useI18n } from '@/lib/i18n-context';
import { fetchAssistantQuestions, type AssistantQuestionsByTopic } from '@/lib/assistant-questions';
import { fetchCounselors, getSelectedCounselorId } from '@/lib/counselor';
import { ResponseFormatSelector } from '@/components/ui/ResponseFormatSelector';
import { useResponseFormat } from '@/lib/use-response-format';
import { ResponseLengthSelector, type ResponseLength } from '@/components/ui/ResponseLengthSelector';
import { ChatBubble } from '@/components/ui/ChatBubble';

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
// Le collezioni builtin hanno label i18n e topic dedicati; le dinamiche
// (create dall'admin nel pannello Documenti RAG) arrivano dal backend.
type Collection = string;
const BUILTIN_COLLECTIONS = ['competenzestrategiche', 'framework', 'questionari', 'counselorbot'] as const;

interface CollectionInfo {
    id: string;
    label: string;
    builtin: boolean;
}

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
// I topic dipendono dalla combinazione (collection, audience): ogni coppia
// ha il suo insieme di schede, distinte per ruolo e base di conoscenza.
type TopicId = string;
const TOPIC_ICONS: Record<string, LucideIcon> = {
    cs_strumenti: ClipboardList,
    cs_risultati: Award,
    cs_approfondire: Library,
    cs_metodologia: ClipboardList,
    cs_validazione: Search,
    cs_didattica: GraduationCap,
    cs_materiali: Library,
    cb_piattaforma: BookOpen,
    cb_strumenti: ClipboardList,
    cb_percorso: Award,
    cb_console: BookOpen,
    cb_counselor: ClipboardList,
    cb_guida: GraduationCap,
    fw_teoria: Library,
    fw_articoli: BookOpen,
    fw_autori: Users,
    q_strumenti: ClipboardList,
    q_fattori: Search,
    q_scoring: Award,
};
// Matrice topic per (collection, audience). Le(collection) definiscono i
// set di schede; gli id sono univoci cosi' ognuno ha titolo/body/prompt
// propri nella i18n (studente e docente hanno argomenti diversi).
const TOPICS_BY_COLLECTION_AUDIENCE: Record<string, Record<Audience, TopicId[]>> = {
    competenzestrategiche: {
        studente: ['cs_strumenti'],
        docente: ['cs_metodologia'],
    },
    counselorbot: {
        studente: ['cb_piattaforma', 'cb_strumenti', 'cb_percorso'],
        docente: ['cb_console', 'cb_counselor', 'cb_guida'],
    },
    framework: {
        studente: ['fw_teoria'],
        docente: ['fw_teoria', 'fw_articoli', 'fw_autori'],
    },
    questionari: {
        studente: ['q_strumenti', 'q_fattori'],
        docente: ['q_strumenti', 'q_fattori', 'q_scoring'],
    },
};
// Le collezioni dinamiche non hanno topic predefiniti: lista vuota.
const topicsFor = (c: Collection, a: Audience): TopicId[] => TOPICS_BY_COLLECTION_AUDIENCE[c]?.[a] ?? [];
const firstTopic = (c: Collection, a: Audience): TopicId => topicsFor(c, a)[0] ?? '';

// Mostra solo il nome leggibile del file citato.
function sourceLabel(src: string): string {
    const base = src.split('/').pop() || src;
    return base.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
}

const docUrl = (source: string, collection: string) =>
    `/api/site-chat/document?source=${encodeURIComponent(source)}&collection=${encodeURIComponent(collection)}`;

export default function AssistentePage() {
    const { streamChat, ...continuation } = useChatContinuation();
    const { t, lang } = useI18n();
    const [identity, setIdentity] = useState<Identity | null | undefined>(undefined);
    const [audience, setAudience] = useState<Audience>('studente');
    const [collection, setCollection] = useState<Collection>('competenzestrategiche');
    const [messages, setMessages] = useState<Msg[]>([]);
    const [input, setInput] = useState('');
    const [responseFormat, setResponseFormat] = useResponseFormat('assistant');
    const [responseLength, setResponseLength] = useState<ResponseLength>('medium');
    const [loading, setLoading] = useState(false);
    const [sessionId, setSessionId] = useState<string | undefined>(undefined);
    const [conversationId, setConversationId] = useState<string | undefined>(undefined);
    const [preview, setPreview] = useState<PreviewState | null>(null);
    const [selectedTopicId, setSelectedTopicId] = useState<TopicId>(firstTopic('competenzestrategiche', 'studente'));
    const scrollRef = useRef<HTMLDivElement>(null);
    // Domande suggerite dal DB (gestite da admin), per topic; per le lingue senza
    // righe si ricade sulle varianti i18n.
    const [dbQuestions, setDbQuestions] = useState<AssistantQuestionsByTopic>({});
    // Indice della prossima domanda per topic: "Prepara domanda" scorre la lista
    // cosi' propone ogni volta una domanda diversa invece di ripetere la stessa.
    const questionVariantIdx = useRef<Record<string, number>>({});
    const requestRef = useRef<AbortController | null>(null);
    // Counselor AI: opzionale, scelta in una dropdown. Il sito-chat invia
    // counselor_id al backend che applichera' la persona al system prompt.
    const [counselorId, setCounselorId] = useState<number | null>(null);
    // Collezioni disponibili (builtin + dinamiche), caricate dal backend.
    const [availableCollections, setAvailableCollections] = useState<CollectionInfo[]>(
        BUILTIN_COLLECTIONS.map((id) => ({ id, label: id, builtin: true })),
    );
    // Sidebar (base di conoscenza + argomenti) nascosta di default: la scelta
    // persiste nel browser così ognuno trova la disposizione che preferisce.
    const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
        try { return localStorage.getItem('cb_assistente_sidebar') === '1'; } catch { return false; }
    });
    const toggleSidebar = () => setSidebarOpen((open) => {
        try { localStorage.setItem('cb_assistente_sidebar', open ? '0' : '1'); } catch { /* resta in memoria */ }
        return !open;
    });

    const topicIds = topicsFor(collection, audience);
    const topics = topicIds.map((id) => ({
        id,
        icon: TOPIC_ICONS[id],
        title: t(`assistant.topic.${id}.title`),
        body: t(`assistant.topic.${id}.body`),
        prompt: t(`assistant.topic.${id}.prompt`),
    }));
    // Puo' essere undefined per le collezioni dinamiche (nessun topic predefinito).
    const selectedTopic = topics.find((x) => x.id === selectedTopicId) ?? topics[0] ?? null;
    const currentCollectionInfo = availableCollections.find((c) => c.id === collection);
    const welcomeKey = currentCollectionInfo?.builtin === false
        ? 'assistant.welcome.dynamic'
        : `assistant.welcome.${collection === 'counselorbot' ? 'cb' : 'cs'}${audience}`;
    const welcomeText = t(welcomeKey, { collection: currentCollectionInfo?.label || collection });

    // Se cambio collection o audience e il topic selezionato non e' piu
    // disponibile nella nuova combinazione, ripristina il primo visibile.
    useEffect(() => {
        if (!topicIds.includes(selectedTopicId) && topicIds.length > 0) {
            setSelectedTopicId(topicIds[0]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [collection, audience]);

    // Audience derivata dal ruolo: se l'admin e' in "view as", segue il profilo
    // di prova (studente -> 'studente'; docente/ricercatore -> 'docente'); per
    // un utente reale cade su canUseTeacherAssistant. Cosi' l'impersonazione
    // studente mostra la versione studente dell'assistente, non quella docente.
    const deriveAudience = (id: Identity | null | undefined): Audience => {
        const viewAs = getViewAsAccount();
        if (viewAs) return viewAs.role === 'studente' ? 'studente' : 'docente';
        return canUseTeacherAssistant(id) ? 'docente' : 'studente';
    };

    useEffect(() => {
        getIdentity().then((id) => {
            setIdentity(id);
            setAudience(deriveAudience(id));
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

    // Carica i counselor attivi per la lingua corrente e mantiene allineata la
    // selezione se cambia dall'esterno (header). counselor_id e' opzionale:
    // in assenza di un counselor attivo si usa l’assistente standard.
    useEffect(() => {
        let active = true;
        fetchCounselors(lang).then((list) => {
            if (!active) return;
            const stored = getSelectedCounselorId();
            setCounselorId(list.some((c) => c.id === stored && c.is_active !== false) ? stored : null);
        });
        return () => { active = false; };
    }, [lang, audience]);

    // Collezioni RAG disponibili (builtin + create dall'admin).
    useEffect(() => {
        let active = true;
        fetch('/api/site-chat/collections')
            .then((res) => (res.ok ? res.json() : null))
            .then((data: CollectionInfo[] | null) => {
                if (active && Array.isArray(data) && data.length > 0) setAvailableCollections(data);
            })
            .catch(() => { /* fallback: builtin */ });
        return () => { active = false; };
    }, []);

    const scrollToBottom = () => {
        requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        });
    };

    const prepareQuestion = () => {
        if (!selectedTopic) return; // collezione dinamica senza topic
        // Preferisci le domande dal DB (gestite da admin); fallback alle varianti i18n.
        const fromDb = dbQuestions[selectedTopic.id] ?? [];
        const promptText = selectedTopic.prompt || '';
        const variants = fromDb.length > 0
            ? fromDb
            : promptText.split('|||').map((s: string) => s.trim()).filter(Boolean);
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

        requestRef.current?.abort();
        const controller = new AbortController();
        requestRef.current = controller;

        try {
            const result = await streamChat(
                { message: question, audience, session_id: sessionId, conversation_id: conversationId, language: lang, collection, counselor_id: counselorId ?? undefined, response_length: responseLength, response_format: responseFormat },
                (full) => updateLast(full),
                controller.signal,
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
            if (result.conversation_id) setConversationId(result.conversation_id);
        } catch (e) {
            // Interruzione chiesta dal lettore: il testo già arrivato resta, non
            // viene sostituito dal messaggio d'errore.
            if (!controller.signal.aborted) {
                updateLast(t('assistant.error', { message: e instanceof Error ? e.message : t('assistant.errorGeneric') }));
            }
        } finally {
            if (requestRef.current === controller) requestRef.current = null;
            setLoading(false);
        }
    };

    const stopGeneration = () => {
        requestRef.current?.abort();
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
        setMessages([]);
        setSessionId(undefined);
        setConversationId(undefined);
        setPreview(null);
    };

    // Cambio base di conoscenza: azzera la conversazione (contesto diverso) e
    // ripristina il primo topic della nuova combinazione (collection, audience).
    const chooseCollection = (next: Collection) => {
        if (next === collection) return;
        setCollection(next);
        setSelectedTopicId(firstTopic(next, audience));
        setMessages([]);
        setSessionId(undefined);
        setConversationId(undefined);
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

    // Anteprima ruolo (admin che impersona un profilo di prova): serve per
    // rendere immediatamente visibile a quale assistente si sta interagando.
    const viewAs = getViewAsAccount();

    // Vedi GuidedChatInterface: aria-live sul trascritto riannuncerebbe a ogni
    // token, quindi la regione porta lo stato di attesa e poi la risposta finita.
    const lastMessage = messages[messages.length - 1];
    const liveAnnouncement = loading
        ? t('guided.thinking')
        : lastMessage?.role === 'assistant' && lastMessage.content.trim()
            ? lastMessage.content
            : '';

    return (
        <div className="flex flex-col lg:h-[calc(var(--chat-h)_+_1.5rem)] lg:-mb-12">
            {/* Layout a due colonne: quadrati a sinistra, chat a destra */}
            <div className="flex flex-1 flex-col gap-4 lg:h-full lg:flex-row lg:gap-6 lg:overflow-hidden">
                {/* Colonna sinistra (sidebar): nascosta di default, richiamabile
                    dal pulsante nella testata della chat. */}
                {sidebarOpen && (
                <div id="assistente-sidebar" className="w-full lg:w-96 shrink-0 flex flex-col gap-4 lg:overflow-y-auto lg:pr-1">
                    {viewAs && (
                        <div className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 ${
                            audience === 'studente'
                                ? 'border-indigo-200 bg-indigo-50 text-indigo-600'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-600'
                        }`}>
                            <Eye className="h-3.5 w-3.5 shrink-0" />
                            <span className="text-xs font-medium">{viewAs.name}</span>
                        </div>
                    )}

                    {/* Selettore base di conoscenza: lista verticale stile radio.
                        Più leggibile della griglia 2×2: una sola scelta evidente,
                        tutte le collezioni (builtin + dinamiche) in colonna. */}
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                            {t('assistant.collection.label')}
                        </p>
                        <div role="radiogroup" aria-label={t('assistant.collection.label')} className="flex flex-col gap-0.5">
                            {availableCollections.map((c) => {
                                const active = collection === c.id;
                                return (
                                    <button
                                        key={c.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={active}
                                        onClick={() => chooseCollection(c.id)}
                                        className={`flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors ${
                                            active
                                                ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200'
                                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                        }`}
                                    >
                                        <span
                                            aria-hidden="true"
                                            className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 transition-colors ${
                                                active ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300 bg-white'
                                            }`}
                                        />
                                        <span className="truncate">{c.builtin ? t(`assistant.collection.${c.id}`) : c.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Selettore argomenti: riga compatta per ogni topic; solo il
                        topic selezionato si espande mostrando la descrizione. Così
                        la lista resta scansionabile a colpo d'occhio e il dettaglio
                        è visibile senza occupare spazio per tutti. */}
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
                            {t('assistant.topic.label')}
                        </p>
                        <div role="radiogroup" aria-label={t('assistant.topic.label')} className="flex flex-col gap-0.5">
                            {topics.map((topic) => {
                                const Icon = topic.icon;
                                const active = selectedTopic?.id === topic.id;
                                return (
                                    <button
                                        key={topic.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={active}
                                        onClick={() => chooseTopic(topic.id)}
                                        className={`rounded-lg px-2.5 py-2 text-left transition-colors ${
                                            active
                                                ? 'bg-indigo-50 ring-1 ring-indigo-200'
                                                : 'hover:bg-slate-100'
                                        }`}
                                    >
                                        <span className="flex items-center gap-2.5">
                                            <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-indigo-700' : 'text-slate-500'}`} aria-hidden="true" />
                                            <span className={`truncate text-sm font-semibold ${active ? 'text-indigo-700' : 'text-slate-800'}`}>
                                                {topic.title}
                                            </span>
                                        </span>
                                        {active && (
                                            <span className="mt-1.5 block pl-6.5 text-xs leading-relaxed text-slate-500">
                                                {topic.body}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
                )}

                {/* Colonna destra: chat - prende tutto lo spazio rimanente */}
                {/* Sotto lg la colonna non clippa: il composer ancorato in fondo
                    (sticky) deve potersi fermare sul bordo del viewport di pagina.
                    Da lg l'altezza è fissa (h-chat) e overflow-hidden resta. */}
                <div className="flex min-h-chat flex-1 min-w-0 flex-col gap-3 lg:overflow-hidden lg:min-h-0 lg:gap-4">
                    <p className="sr-only" aria-live="polite">{liveAnnouncement}</p>

                    {/* Testata della chat: toggle sidebar + titolo. Il titolo resta
                        visibile anche a sidebar chiusa, che è lo stato predefinito. */}
                    <div className="flex shrink-0 items-center gap-3">
                        <button
                            type="button"
                            onClick={toggleSidebar}
                            aria-expanded={sidebarOpen}
                            aria-controls="assistente-sidebar"
                            title={sidebarOpen ? t('assistant.sidebar.hide') : t('assistant.sidebar.show')}
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-indigo-300 hover:text-indigo-600"
                        >
                            {sidebarOpen ? <PanelLeftClose className="h-4.5 w-4.5" aria-hidden="true" /> : <PanelLeftOpen className="h-4.5 w-4.5" aria-hidden="true" />}
                        </button>
                        <h1 className="text-2xl font-bold text-slate-900">{t('assistant.title')}</h1>
                    </div>

                    <div ref={scrollRef} role="log" aria-label={t('assistant.title')} className="glass-panel min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
                        {messages.length === 0 && (
                            <div className="flex items-start gap-3 text-slate-600">
                                <p className="text-sm leading-relaxed pt-1">{welcomeText}</p>
                            </div>
                        )}

                        {messages.map((msg, i) => (
                            <div key={i} className={`flex min-w-0 items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                <ChatBubble role={msg.role === 'user' ? 'user' : 'assistant'} className="max-w-[92%] sm:max-w-[80%]">
                                    {msg.role === 'assistant' && !msg.content
                                        ? <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                                        : (
                                            <div className="prose prose-sm max-w-none break-words prose-p:my-1.5 prose-headings:my-2">
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
                                                aria-label={t('assistant.feedbackUp')}
                                                className={`tap-icon rounded transition-colors disabled:cursor-default ${
                                                    msg.feedback === true ? 'text-green-600' : 'text-slate-500 hover:text-green-600'
                                                }`}
                                            >
                                                <ThumbsUp className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => submitFeedback(i, false)}
                                                disabled={msg.feedback !== undefined}
                                                title={t('assistant.feedbackDown')}
                                                aria-label={t('assistant.feedbackDown')}
                                                className={`tap-icon rounded transition-colors disabled:cursor-default ${
                                                    msg.feedback === false ? 'text-red-600' : 'text-slate-500 hover:text-red-600'
                                                }`}
                                            >
                                                <ThumbsDown className="w-4 h-4" />
                                            </button>
                                            {msg.feedback !== undefined && (
                                                <span className="text-xs text-slate-500 ml-1">{t('assistant.feedbackThanks')}</span>
                                            )}
                                        </div>
                                    )}
                                </ChatBubble>
                            </div>
                        ))}
                    </div>

                    <ChatContinuation locale={lang} {...continuation} />
                    {/* Composer unico: input e controlli dentro la stessa card, cosi'
                        il bordo e' sempre completo (prima i filetti flottanti davano
                        l'impressione che la textarea fosse tagliata). Sotto lg la
                        card resta ancorata al fondo della vista; da lg termina a
                        ~40px dal fondo finestra e -mb-12 sul wrapper annulla il
                        padding-bottom del main, senza lasciare banda morta. */}
                    <div className="shrink-0 max-lg:sticky max-lg:bottom-0 max-lg:z-10 max-lg:-mx-4 max-lg:-mb-12 max-lg:bg-slate-50 max-lg:px-4 max-lg:pb-3 max-lg:pt-1">
                        <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500">
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
                                className="min-w-0 w-full resize-none border-0 bg-transparent px-2 py-1.5 text-sm focus:outline-none focus:ring-0"
                            />
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={prepareQuestion}
                                    disabled={!selectedTopic}
                                    title={t('assistant.prepareQuestion')}
                                    aria-label={t('assistant.prepareQuestion')}
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-lg font-bold text-slate-500 transition-colors hover:border-indigo-300 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    <span aria-hidden="true">?</span>
                                </button>
                                <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                                    <ResponseFormatSelector value={responseFormat} onChange={setResponseFormat} disabled={loading} />
                                    <ResponseLengthSelector
                                        value={responseLength}
                                        onChange={setResponseLength}
                                        disabled={loading}
                                    />
                                {loading ? (
                                    <button
                                        onClick={stopGeneration}
                                        aria-label={t('chat.stop')}
                                        title={t('chat.stop')}
                                        className="flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-slate-700 px-0 text-white transition-colors hover:bg-slate-800 sm:w-auto sm:px-5"
                                    >
                                        <Square className="h-5 w-5 fill-current" />
                                    </button>
                                ) : (
                                    <button
                                        onClick={send}
                                        disabled={!input.trim()}
                                        aria-label={t('chat.send')}
                                        className="flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-0 text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:px-5"
                                    >
                                        <Send className="w-5 h-5" />
                                    </button>
                                )}
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Pannello anteprima documento */}
                {preview && (
                    <aside className="glass-panel flex min-h-[22rem] max-h-[min(70svh,34rem)] w-full flex-col lg:h-full lg:max-h-none lg:min-h-0 lg:w-[460px] lg:shrink-0">
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
                                className="p-1 text-slate-500 hover:text-indigo-600 transition-colors"
                            >
                                <ExternalLink className="w-4 h-4" />
                            </a>
                            <button
                                onClick={() => setPreview(null)}
                                title={t('assistant.previewClose')}
                                className="p-1 text-slate-500 hover:text-slate-700 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex-1 min-h-0 overflow-hidden">
                            {preview.loading && (
                                <div className="h-full flex items-center justify-center text-slate-500">
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
