'use client';
import { ChatGPTUsageBadge } from '@/components/profile/ChatGPTUsageBadge';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { LucideIcon } from 'lucide-react';
import { GraduationCap, BookOpen, Loader2, FileText, ThumbsUp, ThumbsDown, X, ExternalLink, ShieldAlert, LogIn, ClipboardList, Library, Search, Award, Eye, Users, PanelLeftClose, PanelLeftOpen, Mic, GitBranch } from 'lucide-react';
import { ChatContinuation, useChatContinuation } from '@/components/ui/ChatContinuation';
import { getIdentity, getViewAsAccount, loginHref, type Identity } from '@/lib/auth';
import { canUseAssistant, canUseTeacherAssistant } from '@/lib/roles';
import { useI18n } from '@/lib/i18n-context';
import { useUserAccess } from '@/lib/use-user-access';
import { isToolAllowed } from '@/lib/user-access';
import { fetchAssistantQuestions, type AssistantQuestionsByTopic } from '@/lib/assistant-questions';
import { fetchCounselors, getSelectedCounselorId } from '@/lib/counselor';
import { ChatResponseSettings } from '@/components/ui/ChatResponseSettings';
import { useResponseFormat } from '@/lib/use-response-format';
import type { ResponseLength } from '@/components/ui/ResponseLengthSelector';
import { ChatBubble, ChatPending } from '@/components/ui/ChatBubble';
import { ChatComposerInput, ChatMessageActions, ChatRow, ChatSendButton, ChatSuggestions, ChatTranscript, chatActionButtonClass } from '@/components/ui/ChatShell';
import { MessageDiagramButton, type SavedMessageDiagram } from '@/components/ui/MessageDiagramButton';
import { addMessageDiagrams } from '@/lib/diagram-request';
import { Tooltip } from '@/components/ui/Tooltip';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { ChatMarkdown } from '@/components/ui/ChatMarkdown';
import { AudioInput } from '@/components/ui/AudioInput';
import { AudioSendOption } from '@/components/ui/AudioSendOption';
import { AudioLanguageOption } from '@/components/ui/AudioLanguageOption';
import { ChatActionsPopover } from '@/components/ui/ChatActionsPopover';
import { ChatMenuSection } from '@/components/ui/ChatOptionsMenu';
import { ListenButton } from '@/components/voice-reader/VoiceReader';
import { chatLayoutLabel } from '@/lib/i18n-chat-layout';
import { diagramContentForSpeech } from '@/lib/diagram-content';

// Anteprima dei documenti: tabelle con bordi + scroll orizzontale. Le risposte
// in chat usano ChatMarkdown.
const mdComponents: Components = {
    table: (props) => (
        <div className="overflow-x-auto my-4">
            <table {...props} className="w-full border-collapse text-xs" />
        </div>
    ),
    th: (props) => <th {...props} className="border border-line-strong bg-surface-sunken px-2 py-1 text-left font-semibold" />,
    td: (props) => <td {...props} className="border border-line px-2 py-1 align-top" />,
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
    const { access, loading: accessLoading } = useUserAccess();
    const [identity, setIdentity] = useState<Identity | null | undefined>(undefined);
    const [audience, setAudience] = useState<Audience>('studente');
    const [collection, setCollection] = useState<Collection>('competenzestrategiche');
    const [messages, setMessages] = useState<Msg[]>([]);
    const [input, setInput] = useState('');
    const [responseFormat, setResponseFormat] = useResponseFormat('assistant');
    const [responseLength, setResponseLength] = useState<ResponseLength>('medium');
    const [loading, setLoading] = useState(false);
    // Audio come nella chat guidata e nella Bussola: dettatura, conversazione
    // a voce e lettura delle risposte.
    const [audioBusy, setAudioBusy] = useState(false);
    const [voiceMode, setVoiceMode] = useState(false);
    const [voiceOptionsContainer, setVoiceOptionsContainer] = useState<HTMLDivElement | null>(null);
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
    const requestRef = useRef<AbortController | null>(null);
    // Counselor AI: opzionale, scelta in una dropdown. Il sito-chat invia
    // counselor_id al backend che applichera' la persona al system prompt.
    const [counselorId, setCounselorId] = useState<number | null>(null);
    // Senza una sessione guidata il server non salva i diagrammi: restano qui finché la pagina è aperta.
    const [savedDiagrams, setSavedDiagrams] = useState<Record<string, SavedMessageDiagram[]>>({});
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
    const topicScope = `${collection}:${audience}`;
    const [checkedTopicScope, setCheckedTopicScope] = useState(topicScope);
    if (checkedTopicScope !== topicScope) {
        setCheckedTopicScope(topicScope);
        if (!topicIds.includes(selectedTopicId) && topicIds.length > 0) {
            setSelectedTopicId(topicIds[0]);
        }
    }

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

    // Carica le domande suggerite dal DB per la lingua corrente.
    useEffect(() => {
        let active = true;
        fetchAssistantQuestions(lang).then((data) => {
            if (active) setDbQuestions(data);
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

    // Domande suggerite dell'argomento: dal DB (gestite da admin), altrimenti
    // le varianti i18n del prompt. Collezione dinamica senza topic: nessuna.
    const fromDb = selectedTopic ? dbQuestions[selectedTopic.id] ?? [] : [];
    const topicQuestions = fromDb.length > 0
        ? fromDb
        : (selectedTopic?.prompt || '').split('|||').map((s: string) => s.trim()).filter(Boolean);

    // audioMessage arriva da AudioInput: il testo trascritto, mentre il campo
    // può essere ancora occupato dalla trascrizione. onPartial porta lo
    // streaming alla conversazione a voce, che legge la risposta mentre arriva.
    const send = async (audioMessage?: string, onPartial?: (reply: string) => void): Promise<string | undefined> => {
        const question = (audioMessage ?? input).trim();
        if (!question || loading || (audioBusy && audioMessage === undefined)) return;
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
                (full) => { updateLast(full); onPartial?.(full); },
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
            return result.response;
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

    if (identity === undefined || accessLoading) {
        return (
            <div className="page-narrow">
                <Card className="p-8 text-center text-sm text-ink-muted">{t('assistant.loadingAccess')}</Card>
            </div>
        );
    }

    if (!identity?.authenticated) {
        return (
            <div className="page-narrow">
                <Card className="p-8 text-center space-y-4">
                    <ShieldAlert className="mx-auto h-10 w-10 text-link" />
                    <div>
                        <h1 className="text-2xl font-semibold text-ink">{t('assistant.authTitle')}</h1>
                        <p className="mt-2 text-sm text-ink-muted">{t('assistant.authBody')}</p>
                    </div>
                    <a href={loginHref('/assistente')} className="inline-flex min-h-control items-center gap-2 rounded-control bg-brand px-6 py-2 text-sm font-semibold text-ink-on-brand hover:bg-brand-hover">
                        <LogIn className="h-4 w-4" />
                        {t('assistant.authLogin')}
                    </a>
                </Card>
            </div>
        );
    }

    if (!canUseAssistant(identity) || !isToolAllowed(access, 'assistant')) {
        return (
            <div className="page-narrow">
                <Card className="p-8 text-center space-y-4">
                    <ShieldAlert className="mx-auto h-10 w-10 text-warning" />
                    <h1 className="text-2xl font-semibold text-ink">{t('assistant.deniedTitle')}</h1>
                    <p className="text-sm text-ink-muted">{t(!canUseAssistant(identity) ? 'assistant.deniedBody' : 'detail.disabledForClass.body')}</p>
                </Card>
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
                        <div className={`flex items-center gap-2 rounded-control border px-4 py-2 ${
                            audience === 'studente'
                                ? 'border-brand-line bg-brand-soft text-link'
                                : 'border-success-line bg-success-soft text-success-ink'
                        }`}>
                            <Eye className="h-4 w-4 shrink-0" />
                            <span className="text-xs font-semibold">{viewAs.name}</span>
                        </div>
                    )}

                    {/* Selettore base di conoscenza: lista verticale stile radio.
                        Più leggibile della griglia 2×2: una sola scelta evidente,
                        tutte le collezioni (builtin + dinamiche) in colonna. */}
                    <div>
                        <p className="text-xs font-semibold text-ink-muted mb-2">
                            {t('assistant.collection.label')}
                        </p>
                        <div role="radiogroup" aria-label={t('assistant.collection.label')} className="flex flex-col gap-1">
                            {availableCollections.map((c) => {
                                const active = collection === c.id;
                                return (
                                    <button
                                        key={c.id}
                                        type="button"
                                        role="radio"
                                        aria-checked={active}
                                        onClick={() => chooseCollection(c.id)}
                                        className={`flex min-h-control items-center gap-2 rounded-control px-2 text-sm transition-colors ${
                                            active
                                                ? 'bg-brand-soft font-semibold text-link ring-1 ring-brand-line'
                                                : 'text-ink-muted hover:bg-surface-raised hover:text-ink'
                                        }`}
                                    >
                                        <span
                                            aria-hidden="true"
                                            className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 transition-colors ${
                                                active ? 'border-brand bg-brand' : 'border-line-strong bg-surface'
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
                        <p className="text-xs font-semibold text-ink-muted mb-2">
                            {t('assistant.topic.label')}
                        </p>
                        <div role="radiogroup" aria-label={t('assistant.topic.label')} className="flex flex-col gap-1">
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
                                        className={`min-h-control rounded-control px-2 py-2 text-left transition-colors ${
                                            active
                                                ? 'bg-brand-soft ring-1 ring-brand-line'
                                                : 'hover:bg-surface-raised'
                                        }`}
                                    >
                                        <span className="flex items-center gap-2">
                                            <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-link' : 'text-ink-muted'}`} aria-hidden="true" />
                                            <span className={`truncate text-sm font-semibold ${active ? 'text-link' : 'text-ink'}`}>
                                                {topic.title}
                                            </span>
                                        </span>
                                        {active && (
                                            <span className="mt-2 block pl-6 text-xs leading-relaxed text-ink-muted">
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
                <div className="flex min-h-chat flex-1 min-w-0 flex-col gap-2 lg:overflow-hidden lg:min-h-0 lg:gap-4">
                    {/* Testata della chat: toggle sidebar + titolo. Il titolo resta
                        visibile anche a sidebar chiusa, che è lo stato predefinito. */}
                    <div className="shrink-0">
                        <PageHeader
                            title={t('assistant.title')}
                            icon={<button
                                type="button"
                                onClick={toggleSidebar}
                                aria-expanded={sidebarOpen}
                                aria-controls="assistente-sidebar"
                                title={sidebarOpen ? t('assistant.sidebar.hide') : t('assistant.sidebar.show')}
                                className="flex h-control w-control shrink-0 items-center justify-center rounded-control border border-line bg-surface text-ink-muted transition-colors hover:border-brand-line hover:text-link"
                            >
                                {sidebarOpen ? <PanelLeftClose className="h-5 w-5" aria-hidden="true" /> : <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />}
                            </button>}
                        />
                    </div>
                    <ChatGPTUsageBadge />
                    <ChatTranscript ref={scrollRef} announcement={liveAnnouncement} aria-label={t('assistant.title')} className="min-h-0 flex-1 overflow-y-auto rounded-card border border-line bg-surface p-4 shadow-card space-y-4">
                        {messages.length === 0 && (
                            <div className="flex items-start gap-4 text-ink-muted">
                                <p className="text-sm leading-relaxed pt-1">{welcomeText}</p>
                            </div>
                        )}

                        {messages.map((msg, i) => msg.role === 'assistant' && !msg.content ? (
                            <ChatPending key={i} label={t('guided.thinking')} />
                        ) : (
                            <ChatRow key={i} role={msg.role === 'user' ? 'user' : 'assistant'}>
                                <ChatBubble role={msg.role === 'user' ? 'user' : 'assistant'}>
                                    {msg.role === 'assistant'
                                        ? <div className="min-w-0 max-w-full" data-voice-source={`assistente-${conversationId ?? 'new'}-${i}`} data-voice-language={lang} data-voice-counselor={counselorId ?? undefined}><ChatMarkdown content={msg.content} locale={lang} errorMessage={t('guided.stepConnError')} /></div>
                                        : <span className="whitespace-pre-line">{msg.content}</span>}
                                    {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                                        <div className="mt-4 pt-2 border-t border-line flex flex-wrap gap-2">
                                            {msg.sources.map((s) => (
                                                <button
                                                    key={s}
                                                    onClick={() => openPreview(s)}
                                                    title={t('assistant.openPreview', { name: sourceLabel(s) })}
                                                    className={`inline-flex min-h-control items-center gap-1 text-xs rounded-control px-2 transition-colors ${
                                                        preview?.source === s
                                                            ? 'bg-brand-soft text-link'
                                                            : 'bg-surface-sunken text-ink-muted hover:bg-brand-soft hover:text-link'
                                                    }`}
                                                >
                                                    <FileText className="w-3 h-3" /> {sourceLabel(s)}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </ChatBubble>
                                {/* La risposta in arrivo non ha ancora azioni: il testo cambia a ogni token. */}
                                {msg.role === 'assistant' && !(loading && i === messages.length - 1) && (
                                    <ChatMessageActions label={chatLayoutLabel(lang, 'messageActions')}>
                                        <MessageDiagramButton
                                            text={diagramContentForSpeech(msg.content) || msg.content}
                                            locale={lang}
                                            label={t('guided.diagram')}
                                            failedLabel={t('guided.diagramFailed')}
                                            placeholder={t('guided.diagramPrompt')}
                                            submitLabel={t('guided.diagramSend')}
                                            sessionId=""
                                            sourceText={msg.content}
                                            savedDiagrams={savedDiagrams}
                                            onSaved={diagram => setSavedDiagrams(previous => addMessageDiagrams(previous, [diagram]))}
                                            disabled={loading}
                                            renderTrigger={(toggleDiagram, diagramOpen) => <>
                                                <Tooltip content={t('guided.diagram')}><Button type="button" variant="ghost" className={chatActionButtonClass} aria-label={t('guided.diagram')} disabled={loading} aria-expanded={diagramOpen} onClick={toggleDiagram}>
                                                    <GitBranch className="h-4 w-4" aria-hidden="true" />
                                                </Button></Tooltip>
                                                {diagramContentForSpeech(msg.content) && <ListenButton id={`assistente-${conversationId ?? 'new'}-${i}`} text={diagramContentForSpeech(msg.content)} language={lang} counselorId={counselorId} className={chatActionButtonClass} />}
                                                {msg.responseId && <>
                                                    <Tooltip content={t('assistant.feedbackUp')}><Button type="button" variant="ghost" className={`${chatActionButtonClass} aria-pressed:bg-brand-soft aria-pressed:text-link`} aria-label={t('assistant.feedbackUp')} aria-pressed={msg.feedback === true} disabled={msg.feedback !== undefined} onClick={() => void submitFeedback(i, true)}>
                                                        <ThumbsUp className="h-4 w-4" aria-hidden="true" />
                                                    </Button></Tooltip>
                                                    <Tooltip content={t('assistant.feedbackDown')}><Button type="button" variant="ghost" className={`${chatActionButtonClass} aria-pressed:bg-brand-soft aria-pressed:text-link`} aria-label={t('assistant.feedbackDown')} aria-pressed={msg.feedback === false} disabled={msg.feedback !== undefined} onClick={() => void submitFeedback(i, false)}>
                                                        <ThumbsDown className="h-4 w-4" aria-hidden="true" />
                                                    </Button></Tooltip>
                                                    {msg.feedback !== undefined && <span role="status" className="ml-2 text-xs text-ink-muted">{t('assistant.feedbackThanks')}</span>}
                                                </>}
                                            </>}
                                        />
                                    </ChatMessageActions>
                                )}
                            </ChatRow>
                        ))}
                    </ChatTranscript>

                    <ChatContinuation locale={lang} {...continuation} />
                    {/* Composer unico: input e controlli dentro la stessa card, cosi'
                        il bordo e' sempre completo (prima i filetti flottanti davano
                        l'impressione che la textarea fosse tagliata). Sotto lg la
                        card resta ancorata al fondo della vista; da lg termina a
                        ~40px dal fondo finestra e -mb-12 sul wrapper annulla il
                        padding-bottom del main, senza lasciare banda morta. */}
                    <div className="shrink-0 max-lg:sticky max-lg:bottom-0 max-lg:z-10 max-lg:-mx-4 max-lg:-mb-12 max-lg:bg-background max-lg:px-4 max-lg:pb-4 max-lg:pt-1">
                        <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="assistente-composer rounded-card border border-line bg-surface p-4 shadow-card">
                            {!loading && !voiceMode && <ChatSuggestions label={t('orientation.suggested.label')} items={topicQuestions} composerId="assistente-composer" onInsert={setInput} />}
                            <div className="flex items-end gap-2">
                                <ChatActionsPopover label={chatLayoutLabel(lang, 'options')}>{close => <div className="divide-y divide-line">
                                    <ChatMenuSection title={chatLayoutLabel(lang, 'menuActions')}>
                                        <div ref={setVoiceOptionsContainer} />
                                        {!voiceMode && <button type="button" disabled={loading || audioBusy} className="flex min-h-control w-full items-center gap-2 rounded-control px-2 py-2 text-left text-sm hover:bg-surface-raised disabled:opacity-50" onClick={() => { close(); setVoiceMode(true); }}>
                                            <Mic className="h-4 w-4 shrink-0" />{t('audio.voice.title')}
                                        </button>}
                                        {!voiceMode && <AudioSendOption />}
                                        <AudioLanguageOption />
                                    </ChatMenuSection>
                                    <ChatResponseSettings
                                        format={{ value: responseFormat, onChange: setResponseFormat, disabled: loading }}
                                        length={{ value: responseLength, onChange: setResponseLength, disabled: loading }} />
                                </div>}</ChatActionsPopover>
                                <ChatComposerInput
                                    id="assistente-composer"
                                    hidden={voiceMode}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder={t('assistant.inputPlaceholder')}
                                    aria-label={t('assistant.inputPlaceholder')}
                                />
                                {/* In conversazione a voce il pulsante Parla occupa la riga. */}
                                <div className={`flex items-end gap-2${voiceMode ? ' min-w-0 flex-1' : ''}`}>
                                    <AudioInput value={input} onChange={setInput} onBusyChange={setAudioBusy}
                                        onSend={(text, onPartial) => send(text, onPartial)}
                                        voiceMode={voiceMode} onExitVoice={() => setVoiceMode(false)} counselorId={counselorId}
                                        voiceOptionsContainer={voiceOptionsContainer}
                                        composerId="assistente-composer" sessionKey={`${collection}:${audience}:${selectedTopicId}`} disabled={loading} />
                                    {!voiceMode && <ChatSendButton loading={loading} onStop={stopGeneration} disabled={!input.trim() || audioBusy} sendLabel={t('chat.send')} stopLabel={t('chat.stop')} />}
                                </div>
                            </div>
                        </form>
                    </div>

                </div>

                {/* Pannello anteprima documento */}
                {preview && (
                    <aside className="flex min-h-[22rem] rounded-card border border-line bg-surface shadow-card max-h-[min(70svh,34rem)] w-full flex-col lg:h-full lg:max-h-none lg:min-h-0 lg:w-[460px] lg:shrink-0">
                        <div className="flex items-center gap-2 px-4 py-2 border-b border-line">
                            <FileText className="w-4 h-4 text-link shrink-0" />
                            <span className="text-sm font-semibold text-ink truncate flex-1" title={preview.title}>
                                {preview.title}
                            </span>
                            <a
                                href={docUrl(preview.source, collection)}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={t('assistant.previewNewTab')}
                                className="inline-flex h-control w-control shrink-0 items-center justify-center rounded-control text-ink-muted hover:text-link transition-colors"
                            >
                                <ExternalLink className="w-4 h-4" />
                            </a>
                            <button
                                onClick={() => setPreview(null)}
                                title={t('assistant.previewClose')}
                                className="inline-flex h-control w-control shrink-0 items-center justify-center rounded-control text-ink-muted hover:text-ink-body transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex-1 min-h-0 overflow-hidden">
                            {preview.loading && (
                                <div className="h-full flex items-center justify-center text-ink-muted">
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                </div>
                            )}
                            {preview.error && (
                                <div className="p-4 text-sm text-danger">{preview.error}</div>
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
