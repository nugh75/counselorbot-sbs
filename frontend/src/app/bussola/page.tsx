'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowRight, Check, Compass, GitBranch, Loader2, Mic, NotebookPen, Sparkles } from 'lucide-react';
import { AudioInput } from '@/components/ui/AudioInput';
import { AudioSendOption } from '@/components/ui/AudioSendOption';
import { AudioLanguageOption } from '@/components/ui/AudioLanguageOption';
import { ChatResponseSettings } from '@/components/ui/ChatResponseSettings';
import { useResponseFormat } from '@/lib/use-response-format';
import { ChatActionsPopover } from '@/components/ui/ChatActionsPopover';
import { ChatMenuSection, ChatMenuSetting } from '@/components/ui/ChatOptionsMenu';
import { GuideHelpLink } from '@/components/guide/GuideHelpLink';
import { chatLayoutLabel } from '@/lib/i18n-chat-layout';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { ListenButton } from '@/components/voice-reader/VoiceReader';
import { ChatBubble, ChatPending } from '@/components/ui/ChatBubble';
import { ChatComposerInput, ChatMessageActions, ChatRow, ChatSendButton, ChatSuggestions, ChatTranscript, chatActionButtonClass } from '@/components/ui/ChatShell';
import { MessageDiagramButton, type SavedMessageDiagram } from '@/components/ui/MessageDiagramButton';
import { Tooltip } from '@/components/ui/Tooltip';
import { diagramContentForSpeech } from '@/lib/diagram-content';
import { ChatMarkdown } from '@/components/ui/ChatMarkdown';
import { QuestionnaireLink } from '@/components/ui/QuestionnaireLink';
import Image from 'next/image';
import { useI18n } from '@/lib/i18n-context';
import {
    completeOrientation,
    fetchOrientationSession,
    fetchOrientationStatus,
    sendOrientationMessage,
    startOrientation,
    type OrientationSession,
} from '@/lib/orientation-api';
import { QUESTIONNAIRES, type QuestionnaireType } from '@/lib/questionnaires';
import { skipOrientationThisVisit, orientationToolHref, safeOrientationNext } from '@/lib/tool-catalog';
import { fetchAccountPreferences } from '@/lib/account-preferences';
import { NotebookContextSelector } from '@/components/qsa/NotebookContextSelector';
import { PracticeNotebookPicker } from '@/components/qsa/PracticeNotebookPicker';
import { getIdentity } from '@/lib/auth';
import { canUseTeacherAssistant } from '@/lib/roles';
import { useUserAccess } from '@/lib/use-user-access';
import { isToolAllowed } from '@/lib/user-access';
import { notebookContextPayload, readStoredNotebookContext, readStoredPracticeNotebookId, storeNotebookContext, storePracticeNotebookId, type NotebookContextChoice } from '@/lib/notebook-context';

function safeNextHref(): string | null {
    if (typeof window === 'undefined') return null;
    return safeOrientationNext(new URLSearchParams(window.location.search).get('next'));
}

function toolName(id: string, t: (key: string) => string): string {
    if (id === 'pqbl') return t('pqbl.card.title');
    const name = QUESTIONNAIRES[id as QuestionnaireType]?.name ?? id;
    const localized = t(`q.${id}.name`);
    return localized === `q.${id}.name` ? name : localized;
}

function toolDescription(id: string, t: (key: string) => string): string {
    if (id === 'pqbl') return t('pqbl.card.desc');
    return t(`q.${id}.description`);
}

export default function BussolaPage() {
    const { t, lang } = useI18n();
    const router = useRouter();
    const { access, loading: accessLoading } = useUserAccess();
    const canWrite = !accessLoading && isToolAllowed(access, 'bussola');
    const [session, setSession] = useState<OrientationSession | null>(null);
    // Senza una sessione guidata il server non salva i diagrammi: restano qui finché la pagina è aperta.
    const [savedDiagrams, setSavedDiagrams] = useState<Record<string, SavedMessageDiagram>>({});
    const [responseFormat, setResponseFormat] = useResponseFormat(`compass:${session?.session_id ?? 'new'}`);
    const [latestSessionId, setLatestSessionId] = useState<string | null>(null);
    const [orientationRequired, setOrientationRequired] = useState(false);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [audioBusy, setAudioBusy] = useState(false);
    const [voiceMode, setVoiceMode] = useState(false);
    const [voiceOptionsContainer, setVoiceOptionsContainer] = useState<HTMLDivElement | null>(null);
    const [completing, setCompleting] = useState(false);
    const [input, setInput] = useState('');
    const [error, setError] = useState('');
    const [nextHref, setNextHref] = useState<string | null>(null);
    const [atFork, setAtFork] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);
    const leavingRef = useRef(false);
    // Docente che si allena: nella Bussola esiste solo la prova (la scelta è
    // condivisa con le chat guidate); il server riverifica ruolo e proprietà.
    const [isTeacherUser, setIsTeacherUser] = useState(false);
    const [notebookChoice, setNotebookChoice] = useState<NotebookContextChoice>(() => readStoredNotebookContext() === 'practice' ? 'practice' : 'default');
    const [practiceNotebookId, setPracticeNotebookId] = useState<number | null>(readStoredPracticeNotebookId);
    useEffect(() => {
        let active = true;
        getIdentity().then((id) => { if (active) setIsTeacherUser(Boolean(id?.authenticated && canUseTeacherAssistant(id))); }).catch(() => {});
        return () => { active = false; };
    }, []);
    const changeNotebookChoice = (value: NotebookContextChoice) => {
        // Non cancella una scelta Studente/Docente/Nessuno fatta nelle chat guidate.
        if (value === 'practice' || readStoredNotebookContext() === 'practice') storeNotebookContext(value);
        setNotebookChoice(value);
    };
    const changePracticeNotebookId = useCallback((id: number | null) => {
        setPracticeNotebookId(id);
        storePracticeNotebookId(id);
    }, []);
    const notebookPayload = notebookContextPayload(isTeacherUser, notebookChoice, practiceNotebookId);

    const openSession = useCallback(async (sessionId: string) => {
        setLoading(true);
        setError('');
        try {
            const row = await fetchOrientationSession(sessionId);
            if (canWrite && row.status === 'in_progress' && !row.counselor_id) {
                const prefs = await fetchAccountPreferences();
                if (!prefs.counselor_ready || !prefs.counselor_id) {
                    router.push('/counselor?next=%2Fbussola');
                    return;
                }
                setSession(await startOrientation(lang, false, prefs.counselor_id));
            } else {
                setSession(row);
            }
        } catch {
            setError(t('orientation.error'));
        } finally {
            setLoading(false);
        }
    }, [canWrite, lang, router, t]);

    const createSession = useCallback(async (newSession: boolean, counselorId: number, notebook: Parameters<typeof startOrientation>[3] = {}) => {
        setLoading(true);
        setError('');
        try {
            const row = await startOrientation(lang, newSession, counselorId, notebook);
            setSession(row);
        } catch {
            setError(t('orientation.error'));
        } finally {
            setLoading(false);
        }
    }, [lang, t]);

    const startConversation = async () => {
        if (loading || !canWrite) return;
        setLoading(true);
        try {
            const prefs = await fetchAccountPreferences();
            if (!prefs.counselor_ready || !prefs.notebook_ready || !prefs.counselor_id) {
                router.push('/inizia?next=%2Fbussola');
                return;
            }
            setAtFork(false);
            await createSession(true, prefs.counselor_id, notebookPayload);
        } catch { setError(t('orientation.error')); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        let active = true;
        setNextHref(safeNextHref());
        void (async () => {
            try {
                const status = await fetchOrientationStatus();
                if (!active) return;
                setLatestSessionId(status.latest_session_id ?? null);
                setOrientationRequired(status.required);
                if (status.required && canWrite) {
                    if (status.in_progress_session_id) await openSession(status.in_progress_session_id);
                    else {
                        setAtFork(true);
                        setLoading(false);
                    }
                } else {
                    setAtFork(canWrite && !status.latest_session_id);
                    setLoading(false);
                }
            } catch {
                if (active) {
                    setError(t('orientation.error'));
                    setLoading(false);
                }
            }
        })();
        return () => { active = false; };
    }, [canWrite, openSession, t]);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [session?.messages.length, sending]);

    const submitMessage = async (event: Pick<FormEvent, 'preventDefault'>, audioMessage?: string) => {
        event.preventDefault();
        const message = (audioMessage ?? input).trim();
        if (!canWrite || !session || !message || sending || (audioBusy && audioMessage === undefined) || session.status === 'completed') return;
        setInput('');
        setSending(true);
        setError('');
        try {
            const row = await sendOrientationMessage(session.session_id, message, lang, responseFormat, notebookPayload);
            setSession(row);
            return row.messages.at(-1)?.role === 'assistant' ? row.messages.at(-1)?.content : undefined;
        } catch {
            setInput(message);
            setError(t('orientation.error'));
        } finally {
            setSending(false);
        }
    };

    // Concludere la Bussola porta subito agli strumenti: niente pannello
    // intermedio con un altro tasto da premere. Se il cancello aveva indicato
    // una destinazione (`?next=`), quella ha la precedenza.
    const finish = async () => {
        if (!session) return;
        setCompleting(true);
        setError('');
        try {
            await completeOrientation(session.session_id);
            skipOrientationThisVisit();
            router.push(nextHref || '/?view=home');
        } catch {
            setError(t('orientation.error'));
            setCompleting(false);
        }
    };

    // Aprire uno strumento chiude la Bussola: il gate rimanda qui chi non l'ha
    // conclusa, quindi la sessione va completata prima di uscire.
    const leaveForTool = async (tool: string) => {
        if (leavingRef.current || !session) return;
        leavingRef.current = true;
        try {
            if (session.status === 'in_progress') await completeOrientation(session.session_id);
            router.push(orientationToolHref(tool));
        } catch {
            setError(t('orientation.error'));
            leavingRef.current = false;
        }
    };

    // L'avviso di errore stava in fondo alla pagina, sotto le raccomandazioni e
    // il taccuino: chi vedeva fallire un invio doveva scorrere per sapere perché.
    // Con la conversazione aperta va sotto il trascritto, accanto alla casella.
    const errorNote = error
        ? <Callout variant="danger" icon={null}>{error}</Callout>
        : null;

    // Due soli stati per lo screen reader: l'attesa e la risposta arrivata.
    const lastMessage = session?.messages[session.messages.length - 1];
    const liveAnnouncement = sending
        ? t('orientation.processing')
        : lastMessage?.role === 'assistant' ? lastMessage.content : '';

    // Chi sa gia' che cosa vuole aprire non deve passare da qui. Il salto vale
    // per la visita: il cancello tace, e il primo strumento davvero avviato
    // rende `required` falso da se'.
    const skipToTools = () => {
        skipOrientationThisVisit();
        router.push('/?view=home');
    };

    // L'altra strada del bivio: il catalogo degli strumenti, la stessa schermata
    // che accoglie chi torna. Il cancello tace per la visita, come nel salto.
    const goToTools = () => {
        skipOrientationThisVisit();
        router.push('/?view=home');
    };

    return (
        <div className="page-wide space-y-8">
            <Card as="section" className="sm:p-8">
                <div className="max-w-3xl space-y-2">
                    <p className="text-xs font-semibold text-move">{t('orientation.eyebrow')}</p>
                    <PageHeader
                        title={t('orientation.title')}
                        subtitle={t('orientation.subtitle')}
                        icon={<Image src="/images/platform/bussola.png" alt="" width={48} height={48} priority className="h-12 w-12 shrink-0 object-contain" />}
                    />
                </div>
            </Card>

            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-link" /></div>
            ) : atFork ? (
                <Card as="section" className="border-brand-line sm:p-8">
                    <div className="max-w-2xl">
                        <h2 className="text-xl font-semibold text-ink">{t('orientation.fork.title')}</h2>
                        <p className="mt-2 text-sm leading-relaxed text-ink-muted">{t('orientation.fork.body')}</p>
                    </div>
                    <div className="mt-6 flex flex-wrap gap-4">
                        <Button type="button" variant="accent" onClick={startConversation}>{t('orientation.landing.open')}</Button>
                        <Button type="button" variant="secondary" onClick={goToTools}>{t('orientation.landing.skip')}</Button>

                    </div>
                </Card>
            ) : !session ? (
                <Card as="section" className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-4"><Compass className="h-6 w-6 text-link" /><p className="text-sm leading-relaxed text-ink-muted">{t('orientation.subtitle')}</p></div>
                    <div className="flex flex-wrap gap-2">
                        {latestSessionId && <Button type="button" variant="secondary" onClick={() => void openSession(latestSessionId)}>{t('orientation.landing.latest')}</Button>}
                        {canWrite && <Button type="button" variant="accent" onClick={() => void startConversation()}>{t('orientation.landing.new')}</Button>}
                        {orientationRequired && <Button type="button" variant="ghost" onClick={skipToTools}>{t('orientation.landing.skip')}</Button>}
                    </div>
                </Card>
            ) : (
                <>
                    <Card as="section" className="overflow-hidden p-0">
                        <ChatTranscript
                            announcement={liveAnnouncement}
                            aria-label={t('orientation.title')}
                            className="max-h-chat space-y-4 overflow-y-auto px-4 py-6 sm:px-6"
                        >
                            {session.messages.map((message, index) => (
                                <ChatRow key={`${message.role}-${index}`} role={message.role === 'user' ? 'user' : 'assistant'}>
                                    <ChatBubble role={message.role === 'user' ? 'user' : 'assistant'}>
                                        <div data-voice-source={message.role === 'assistant' ? `bussola-${session.session_id}-${index}` : undefined}
                                            data-voice-language={session.language || lang} data-voice-counselor={session.counselor_id ?? undefined} className="min-w-0 max-w-full">{message.role === "assistant" ? <ChatMarkdown content={message.content} locale={session.language || lang} errorMessage={t('guided.stepConnError')} /> : <span className="whitespace-pre-line">{message.content}</span>}</div>
                                    </ChatBubble>
                                    {message.role === 'assistant' && (
                                        <ChatMessageActions label={chatLayoutLabel(session.language || lang, 'messageActions')}>
                                            <MessageDiagramButton
                                                text={diagramContentForSpeech(message.content) || message.content}
                                                locale={session.language || lang}
                                                label={t('guided.diagram')}
                                                failedLabel={t('guided.diagramFailed')}
                                                placeholder={t('guided.diagramPrompt')}
                                                submitLabel={t('guided.diagramSend')}
                                                sessionId=""
                                                sourceText={message.content}
                                                savedDiagrams={savedDiagrams}
                                                onSaved={diagram => setSavedDiagrams(previous => ({ ...previous, [diagram.source_key]: diagram }))}
                                                disabled={sending}
                                                renderTrigger={(toggleDiagram, diagramOpen) => <>
                                                    <Tooltip content={t('guided.diagram')}><Button type="button" variant="ghost" className={chatActionButtonClass} aria-label={t('guided.diagram')} disabled={sending} aria-expanded={diagramOpen} onClick={toggleDiagram}>
                                                        <GitBranch className="h-4 w-4" aria-hidden="true" />
                                                    </Button></Tooltip>
                                                    <ListenButton id={`bussola-${session.session_id}-${index}`} text={message.content} language={session.language as typeof lang || lang} counselorId={session.counselor_id} className={chatActionButtonClass} />
                                                </>}
                                            />
                                        </ChatMessageActions>
                                    )}
                                </ChatRow>
                            ))}
                            {sending && <ChatPending label={t('orientation.processing')} />}
                            <div ref={endRef} />
                        </ChatTranscript>
                        {session.recommendations.length > 0 && (
                            <div className="border-t border-line px-4 py-2 sm:px-6">
                                <button
                                    type="button"
                                    // Qui scrollare la pagina e' l'intento: il pannello sta sotto
                                    // la piega e senza questo non c'era nulla che lo indicasse.
                                    onClick={() => document.getElementById('orientation-recommendations')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                    className="inline-flex min-h-control items-center gap-2 text-sm font-semibold text-link hover:underline"
                                >
                                    {t('orientation.recommendations.jump', { count: session.recommendations.length })}
                                    <ArrowDown className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                        {errorNote && <div className="border-t border-line px-4 py-4 sm:px-6">{errorNote}</div>}
                        {canWrite && session.status === 'in_progress' && (
                            <form onSubmit={submitMessage} className="border-t border-line bg-surface-sunken p-4">
                                {!sending && <ChatSuggestions label={t('orientation.suggested.label')} items={[0, 1, 2, 3, 4].map(index => t(`orientation.suggested.${index}`))} composerId="bussola-composer" onInsert={setInput} />}
                                <div className="flex items-end gap-2">
                                    <ChatActionsPopover label={chatLayoutLabel(lang, 'options')}>{close => <div className="divide-y divide-line">
                                        <ChatMenuSection title={chatLayoutLabel(lang, 'menuActions')}>
                                            <div ref={setVoiceOptionsContainer} />
                                            {!voiceMode && <button type="button" disabled={sending || audioBusy} className="flex min-h-control w-full items-center gap-2 rounded-control px-2 py-2 text-left text-sm hover:bg-surface-raised disabled:opacity-50" onClick={() => { close(); setVoiceMode(true); }}>
                                                <Mic className="h-4 w-4 shrink-0" />{t('audio.voice.title')}
                                            </button>}
                                            {!voiceMode && <AudioSendOption />}
                                            <AudioLanguageOption />
                                        </ChatMenuSection>
                                        <ChatResponseSettings format={{ value: responseFormat, onChange: setResponseFormat, disabled: sending }}>
                                            {isTeacherUser && <ChatMenuSetting icon={<NotebookPen className="h-4 w-4 shrink-0" aria-hidden="true" />}
                                                label={t('notebookContext.label')} value={t(`notebookContext.${notebookChoice}`)} title={t('notebookContext.label')}>
                                                <NotebookContextSelector list value={notebookChoice} onChange={changeNotebookChoice} disabled={sending} options={['default', 'practice']} />
                                                {notebookChoice === 'practice' && <PracticeNotebookPicker value={practiceNotebookId} onChange={changePracticeNotebookId} disabled={sending} />}
                                            </ChatMenuSetting>}
                                        </ChatResponseSettings>
                                        <div className="px-2 pt-2"><GuideHelpLink task="orientation" /></div>
                                    </div>}</ChatActionsPopover>
                                    <ChatComposerInput id="bussola-composer" hidden={voiceMode} value={input} onChange={(event) => setInput(event.target.value)} maxLength={4000} placeholder={t('orientation.input.placeholder')} aria-label={t('orientation.input.placeholder')} />
                                    <AudioInput value={input} onChange={setInput} onBusyChange={setAudioBusy}
                                        onSend={text => submitMessage({ preventDefault() {} }, text)}
                                        voiceMode={voiceMode} onExitVoice={() => setVoiceMode(false)} counselorId={session.counselor_id}
                                        voiceOptionsContainer={voiceOptionsContainer}
                                        composerId="bussola-composer" sessionKey={session.session_id} disabled={sending} maxLength={4000} />
                                    {!voiceMode && <ChatSendButton loading={sending} disabled={!input.trim() || audioBusy} sendLabel={t('orientation.input.send')} />}
                                </div>
                            </form>
                        )}
                    </Card>

                    {session.recommendations.length > 0 && (
                        <div id="orientation-recommendations">
                            <RecommendationSection session={session} onPick={tool => void leaveForTool(tool)} />
                        </div>
                    )}

                    {session.status === 'in_progress' && session.recommendations.length > 0 && canWrite && (
                        <div className="flex justify-start">
                            <Button type="button" size="lg" onClick={() => void finish()} disabled={completing}>
                                {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{t('orientation.complete')}
                            </Button>
                        </div>
                    )}
                    {session.status === 'completed' && (
                        <Card as="section" className="space-y-4 border-success-line">
                            <div className="flex gap-4"><Sparkles className="h-6 w-6 shrink-0 text-success" /><div><h2 className="text-xl font-semibold text-ink">{t('orientation.completed.title')}</h2><p className="mt-1 text-sm leading-relaxed text-ink-muted">{t('orientation.completed.body')}</p></div></div>
                            {/* Concludere la Bussola non e' un vicolo cieco: la home con il
                                catalogo c'e' sempre. `?next=` lo mette solo il cancello quando
                                rimanda qui, e allora si puo' anche riprendere quella strada. */}
                            <div className="flex flex-wrap gap-2">
                                <Button type="button" variant="accent" onClick={goToTools}>{t('orientation.completed.allTools')}<ArrowRight className="h-4 w-4" /></Button>
                                {nextHref && <Link href={nextHref} className="inline-flex min-h-control items-center gap-2 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink-body transition-colors hover:bg-surface-sunken">{t('orientation.continue')}</Link>}
                            </div>
                            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
                                {canWrite && <Button type="button" variant="ghost" onClick={() => void startConversation()} className="ml-auto text-link hover:bg-brand-soft">{t('orientation.landing.new')}</Button>}
                            </div>
                        </Card>
                    )}


                </>
            )}

            {!session && errorNote}
            {!accessLoading && !canWrite && <p className="text-sm text-ink-muted" role="status">{t('session.disabledForClass')}</p>}
        </div>
    );
}

function RecommendationSection({ session, onPick }: { session: OrientationSession; onPick: (id: string) => void }) {
    const { t } = useI18n();
    const { access, loading } = useUserAccess();
    const recommendations = session.recommendations.filter(item => isToolAllowed(access, item.id));
    if (loading || recommendations.length === 0) return null;
    return (
        <section>
            <h2 className="text-xl font-semibold text-ink">{t('orientation.recommendations.title')}</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">{t('orientation.recommendations.subtitle')}</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
                {recommendations.map((item, index) => (
                    <Card as="article" key={item.id} className={`flex flex-col ${index === 0 ? 'border-brand-line' : ''}`}>
                        <div className="flex items-center justify-between gap-4"><span className="text-xs font-semibold text-move">{String(index + 1).padStart(2, '0')}</span>{index === 0 && <Compass className="h-5 w-5 text-link" />}</div>
                        <h3 className="mt-2 text-lg font-semibold text-ink">{toolName(item.id, t)}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-ink-muted">{toolDescription(item.id, t)}</p>
                        <p className="mt-4 grow text-sm leading-relaxed text-ink-body">{item.reason}</p>
                        {/* La Bussola manda a `/?start=<id>`, che salta la card di scelta:
                            senza questo, il link al questionario non lo vede mai nessuno. */}
                        <QuestionnaireLink instrument={item.id} className="mt-4" />
                        <Button type="button" onClick={() => onPick(item.id)} className="mt-6 justify-between">{t('orientation.recommendation.start')}<ArrowRight className="h-4 w-4" /></Button>
                    </Card>
                ))}
            </div>
        </section>
    );
}
