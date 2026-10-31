'use client';

// Chat libera: una conversazione aperta sul profilo, senza passi né fasi. Parla
// con lo stesso /api/chat/stream della chat guidata (modelli, fornitori e
// counselor scelti dall'amministrazione) e usa gli stessi elementi di chat e la
// stessa barra laterale, senza il percorso. Il mode `free` dà al server il
// prompt e il contratto di turno propri della chat libera (#754).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, BookOpen, GitBranch, Mic, PanelLeft, Snowflake } from 'lucide-react';
import { ChatGPTUsageBadge } from '@/components/profile/ChatGPTUsageBadge';
import { ListenButton } from '@/components/voice-reader/VoiceReader';
import { AudioInput } from '@/components/ui/AudioInput';
import { AudioLanguageOption } from '@/components/ui/AudioLanguageOption';
import { AudioSendOption } from '@/components/ui/AudioSendOption';
import { Button } from '@/components/ui/Button';
import { ChatActionsPopover } from '@/components/ui/ChatActionsPopover';
import { ChatBubble, ChatPending, ChatPendingIndicator } from '@/components/ui/ChatBubble';
import { ChatContinuation, useChatContinuation } from '@/components/ui/ChatContinuation';
import { ChatMarkdown } from '@/components/ui/ChatMarkdown';
import { ChatMenuSection } from '@/components/ui/ChatOptionsMenu';
import { ChatResponseSettings } from '@/components/ui/ChatResponseSettings';
import { ChatComposerInput, ChatMessageActions, ChatRow, ChatSendButton, ChatTranscript } from '@/components/ui/ChatShell';
import { MessageDiagramButton, openMessageDiagram, type SavedMessageDiagram } from '@/components/ui/MessageDiagramButton';
import { toast } from '@/components/ui/Toast';
import { Tooltip } from '@/components/ui/Tooltip';
import type { ReasoningEffort } from '@/components/ui/ReasoningSelector';
import type { ResponseLength } from '@/components/ui/ResponseLengthSelector';
import { buildScoresFormatter } from '@/components/qsa/GuidedChatInterface';
import { ChatWorkspace } from '@/components/qsa/ChatWorkspace';
import { ProfileScoresPanel, useScoreGroups } from '@/components/qsa/ProfileScoresPanel';
import { RecommendationsPanel } from '@/components/qsa/RecommendationsPanel';
import { GuideHelpLink } from '@/components/guide/GuideHelpLink';
import { apiFetch } from '@/lib/auth';
import { AUTO_FREEZE_DELAY_MS, autoFreezeSignature, shouldAutoFreeze } from '@/lib/auto-freeze';
import { ChatProviderError } from '@/lib/chat-stream';
import { isNearBottom } from '@/lib/chat-scroll';
import { chatLayoutLabel } from '@/lib/i18n-chat-layout';
import { chatErrorText } from '@/lib/i18n-personal-api';
import { diagramContentForSpeech } from '@/lib/diagram-content';
import { addMessageDiagrams, messageDiagramList } from '@/lib/diagram-request';
import { factorTranslationKey } from '@/lib/questionnaires';
import { freezeSession, type FrozenSessionDetail, type FrozenSessionMessage, type FrozenSessionSnapshot } from '@/lib/frozen-session';
import { stripControlMarkersForDisplay } from '@/lib/control-markers';
import { EMPTY_RECOMMENDATIONS, normalizeRecommendationCatalog, type RecommendationCatalog } from '@/lib/recommendations';
import { useIsDesktop } from '@/lib/use-desktop';
import type { ResponseFormat } from '@/lib/chat-preferences';
import type { Lang } from '@/lib/i18n';
import { useI18n } from '@/lib/i18n-context';

interface FreeChatInterfaceProps {
    counselorId: number | null;
    scores: Record<string, number>;
    questionnaireType: string;
    sessionId: string;
    locale?: string;
    onComplete: () => void;
    onFrozen?: () => void;
    onBack?: () => void;
    frozenSnapshot?: FrozenSessionDetail | null;
    initialResponseLength?: ResponseLength;
    initialReasoningEffort?: ReasoningEffort;
    initialResponseFormat?: ResponseFormat;
    reasoningCapable?: boolean;
    reasoningMandatory?: boolean;
}

export function FreeChatInterface({
    counselorId, scores, questionnaireType, sessionId, locale, onComplete, onFrozen, onBack, frozenSnapshot,
    initialResponseLength = 'medium', initialReasoningEffort = 'standard', initialResponseFormat = 'standard',
    reasoningCapable = true, reasoningMandatory = false,
}: FreeChatInterfaceProps) {
    const { t, tf, lang } = useI18n();
    const activeLocale: Lang = (locale as Lang | undefined) ?? lang;
    const { streamChat, ...continuation } = useChatContinuation();
    const restored = frozenSnapshot?.session_id === sessionId ? frozenSnapshot : null;
    const [messages, setMessages] = useState<FrozenSessionMessage[]>(() => restored?.messages ?? []);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [conversationId, setConversationId] = useState<string | undefined>(restored?.conversation_id ?? undefined);
    const [responseLength, setResponseLength] = useState<ResponseLength>(restored?.response_length ?? initialResponseLength);
    const [responseFormat, setResponseFormat] = useState<ResponseFormat>(restored?.response_format ?? initialResponseFormat);
    const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(restored?.reasoning_effort ?? initialReasoningEffort);
    const [savedDiagrams, setSavedDiagrams] = useState<SavedMessageDiagram[]>([]);
    const [recommendations, setRecommendations] = useState<RecommendationCatalog>(EMPTY_RECOMMENDATIONS);
    const desktop = useIsDesktop();
    const [audioBusy, setAudioBusy] = useState(false);
    const [voiceMode, setVoiceMode] = useState(false);
    const [voiceOptionsContainer, setVoiceOptionsContainer] = useState<HTMLDivElement | null>(null);
    const requestRef = useRef<AbortController | null>(null);
    const messagesRef = useRef<HTMLDivElement>(null);
    const stickToBottom = useRef(true);
    const completedRef = useRef(false);
    const savedSignatureRef = useRef('');
    const pendingSnapshotRef = useRef<{ snapshot: FrozenSessionSnapshot; signature: string } | null>(null);

    const formatScores = useMemo(
        () => buildScoresFormatter(questionnaireType, (code, fallback) => tf(factorTranslationKey(questionnaireType, code, 'name'), fallback)),
        [questionnaireType, tf],
    );
    const diagramsByMessage = useMemo(() => addMessageDiagrams({}, savedDiagrams), [savedDiagrams]);
    const scoreGroups = useScoreGroups(questionnaireType, scores);
    const hasScoreEntries = scoreGroups.some(group => group.entries.length > 0);
    const resourceCount = recommendations.reading.length + recommendations.strategy.length;

    useEffect(() => () => requestRef.current?.abort(), []);
    useEffect(() => {
        const el = messagesRef.current;
        if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
    }, [messages]);
    // Consigli della sessione (letture, strategie, consigli): stesso catalogo
    // della chat guidata, aggiornato a ogni turno dalla risposta del server.
    useEffect(() => {
        let active = true;
        setRecommendations(EMPTY_RECOMMENDATIONS);
        if (sessionId) void apiFetch(`/api/session/${encodeURIComponent(sessionId)}/recommendations?lang=${activeLocale}`)
            .then(response => response.ok ? response.json() : null)
            .then(payload => { if (active && payload) setRecommendations(normalizeRecommendationCatalog(payload)); })
            .catch(() => undefined);
        return () => { active = false; };
    }, [sessionId, activeLocale]);
    useEffect(() => {
        let active = true;
        setSavedDiagrams([]);
        if (sessionId) void apiFetch(`/api/session/${encodeURIComponent(sessionId)}/diagrams`)
            .then(response => response.ok ? response.json() : [])
            .then((items: SavedMessageDiagram[]) => {
                if (active && Array.isArray(items)) setSavedDiagrams(previous => [...items, ...previous]);
            }).catch(() => undefined);
        return () => { active = false; };
    }, [sessionId]);

    const stopGeneration = () => requestRef.current?.abort();

    const handleSend = async (e: { preventDefault: () => void }, overrideText?: string, audioReady = false, onPartial?: (reply: string) => void) => {
        e.preventDefault();
        const userMessage = (overrideText ?? input).trim();
        if (!userMessage || isLoading || (audioBusy && !audioReady)) return;
        setMessages(prev => [...prev, { role: 'user', content: userMessage }, { role: 'assistant', content: '' }]);
        setInput('');
        setIsLoading(true);
        requestRef.current?.abort();
        const controller = new AbortController();
        requestRef.current = controller;
        const updateLast = (patch: Partial<FrozenSessionMessage>) => setMessages(prev => {
            const copy = [...prev];
            copy[copy.length - 1] = { ...copy[copy.length - 1], role: 'assistant', ...patch };
            return copy;
        });
        try {
            // Nessuna `phase` e mode `free`: il server usa il prompt e il
            // contratto della chat libera. Il profilo viaggia come contesto.
            const result = await streamChat({
                message: userMessage,
                memory_message: userMessage,
                mode: 'free',
                session_id: sessionId,
                conversation_id: conversationId,
                questionnaire_type: questionnaireType,
                scores_context: formatScores(scores),
                language: activeLocale,
                max_tokens: 900,
                response_length: responseLength,
                response_format: responseFormat,
                reasoning_effort: reasoningEffort,
                counselor_id: counselorId,
            }, (full) => { updateLast({ content: stripControlMarkersForDisplay(full) }); onPartial?.(full); },
            controller.signal,
            (reasoning) => { if (reasoningEffort !== 'off') updateLast({ reasoning }); });
            if (result.conversation_id) setConversationId(result.conversation_id);
            if (result.recommendations) setRecommendations(normalizeRecommendationCatalog(result.recommendations));
            const text = (result.response || '').trim();
            if (text) updateLast({
                content: text,
                ...(result.strategy_ids?.length ? { strategyIds: result.strategy_ids } : {}),
                ...(result.response_id ? { responseId: result.response_id } : {}),
            });
            else setMessages(prev => prev.slice(0, -1));
            return text || undefined;
        } catch (error) {
            if (controller.signal.aborted) return;
            updateLast({ content: (error instanceof ChatProviderError ? chatErrorText(activeLocale, error.code) : null) ?? t('guided.connError') });
        } finally {
            if (requestRef.current === controller) {
                requestRef.current = null;
                setIsLoading(false);
            }
        }
    };

    const buildSnapshot = (): FrozenSessionSnapshot => ({
        session_id: sessionId,
        questionnaire_type: questionnaireType,
        messages,
        current_phase: 'free',
        scores,
        counselor_id: counselorId,
        experience: 'free',
        conversation_id: conversationId,
        locale: activeLocale,
        response_length: responseLength,
        response_format: responseFormat,
        reasoning_effort: reasoningEffort,
        label: `${questionnaireType} — ${t('guided.mode.sandbox')}`,
    });
    const signature = () => autoFreezeSignature({ messages, currentPhase: 'free', responseLength, responseFormat });

    const flushAutoFreeze = useCallback(async (options: { keepalive?: boolean } = {}) => {
        const pending = pendingSnapshotRef.current;
        if (!pending || completedRef.current) return;
        pendingSnapshotRef.current = null;
        savedSignatureRef.current = pending.signature;
        try { await freezeSession(pending.snapshot, options); }
        catch { savedSignatureRef.current = ''; }
    }, []);

    // Stesso autosalvataggio della chat guidata: a fine turno lo stato va sul
    // server, così la sessione si riprende da qualsiasi dispositivo.
    useEffect(() => {
        if (!shouldAutoFreeze({ sessionId, messageCount: messages.length, isLoading, completed: completedRef.current })) return;
        const current = signature();
        if (current === savedSignatureRef.current) return;
        pendingSnapshotRef.current = { snapshot: buildSnapshot(), signature: current };
        const timer = window.setTimeout(() => { void flushAutoFreeze(); }, AUTO_FREEZE_DELAY_MS);
        return () => window.clearTimeout(timer);
        // buildSnapshot legge lo stato corrente a ogni render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages, responseLength, responseFormat, reasoningEffort, isLoading, sessionId]);

    useEffect(() => {
        const onPageHide = () => { void flushAutoFreeze({ keepalive: true }); };
        window.addEventListener('pagehide', onPageHide);
        return () => {
            window.removeEventListener('pagehide', onPageHide);
            void flushAutoFreeze();
        };
    }, [flushAutoFreeze]);

    const handleFreeze = async () => {
        if (isLoading) return;
        try {
            await freezeSession(buildSnapshot());
            pendingSnapshotRef.current = null;
            savedSignatureRef.current = signature();
            toast.success(t('frozen.frozen'));
            onFrozen?.();
        } catch {
            toast.error(t('toast.error'));
        }
    };

    const stepButtonClass = 'h-[44px] w-[44px] shrink-0 p-0';
    const messageActionClass = 'chat-action-item flex min-h-[44px] w-full items-center gap-2 rounded-md px-2 text-left text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50';
    const lastMessage = messages[messages.length - 1];
    const awaitingAssistantBubble = lastMessage?.role === 'assistant' && !lastMessage.content.trim();
    const liveAnnouncement = isLoading ? t('guided.processing') : lastMessage?.role === 'assistant' ? lastMessage.content : '';

    const options = (openPanel: (panel?: 'scores' | 'resources') => void) => (
        <ChatActionsPopover label={chatLayoutLabel(activeLocale, 'options')}>
            {close => <div className="divide-y divide-slate-200">
                <ChatMenuSection title={chatLayoutLabel(activeLocale, 'menuActions')}>
                    <div ref={setVoiceOptionsContainer} />
                    {!voiceMode && <button type="button" className={messageActionClass} disabled={isLoading || audioBusy} onClick={() => { close(); setVoiceMode(true); }}>
                        <Mic className="h-4 w-4 shrink-0" />{t('audio.voice.title')}
                    </button>}
                    {!voiceMode && <AudioSendOption compact />}
                    <AudioLanguageOption compact />
                </ChatMenuSection>
                {/* Come nella chat guidata, senza la voce Percorso. */}
                <ChatMenuSection title={chatLayoutLabel(activeLocale, 'menuShow')}>
                    {desktop && <button type="button" className={messageActionClass} onClick={() => { close(); openPanel(); }}>
                        <PanelLeft className="h-4 w-4 shrink-0" aria-hidden="true" />{chatLayoutLabel(activeLocale, 'panel')}
                        {resourceCount > 0 && <span className="ml-auto text-xs">{resourceCount}</span>}
                    </button>}
                    {!desktop && hasScoreEntries && <button type="button" className={messageActionClass} onClick={() => { close(); openPanel('scores'); }}>
                        <BarChart3 className="h-4 w-4 shrink-0" aria-hidden="true" />{t('guided.scores')}
                    </button>}
                    {!desktop && resourceCount > 0 && <button type="button" className={messageActionClass} aria-label={t('recommendations.title')} onClick={() => { close(); openPanel('resources'); }}>
                        <BookOpen className="h-4 w-4 shrink-0" aria-hidden="true" />{t('recommendations.title')}
                        <span className="ml-auto text-xs">{resourceCount}</span>
                    </button>}
                </ChatMenuSection>
                <ChatResponseSettings locale={activeLocale}
                    format={{ value: responseFormat, onChange: setResponseFormat, disabled: isLoading }}
                    length={{ value: responseLength, onChange: setResponseLength, disabled: isLoading }}
                    reasoning={reasoningCapable ? { value: reasoningEffort, onChange: setReasoningEffort, disabled: isLoading, mandatory: reasoningMandatory } : undefined} />
                <div className="px-2 pt-2"><GuideHelpLink task="chat" /></div>
            </div>}
        </ChatActionsPopover>
    );

    return (
        <div className="space-y-4">
            <ChatGPTUsageBadge />
            <ChatWorkspace locale={activeLocale} subtitle={t('guided.mode.sandbox')} onBack={onBack}
                advancement={
                    <nav className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-slate-600" aria-label={t('guided.mode.sandbox')}>
                        <span className="flex min-w-0 items-center gap-2">
                            {sessionId && <Tooltip content={t('frozen.freeze')}>
                                <button type="button" onClick={() => void handleFreeze()} disabled={isLoading}
                                    aria-label={t('frozen.freeze')}
                                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 disabled:cursor-not-allowed disabled:opacity-50">
                                    <Snowflake className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                            </Tooltip>}
                            <span className="truncate font-semibold text-slate-800">{t('guided.mode.sandbox')}</span>
                        </span>
                        <Button type="button" variant="secondary" disabled={isLoading} onClick={() => { completedRef.current = true; pendingSnapshotRef.current = null; onComplete(); }}>
                            {t('guided.concludeSession')}
                        </Button>
                    </nav>
                }
                sidebar={(closePanel, mobilePanel) => <>
                    <div hidden={mobilePanel !== null && mobilePanel !== 'resources'}><RecommendationsPanel
                        expanded={mobilePanel === 'resources'}
                        catalog={recommendations}
                        sessionId={sessionId}
                        onCatalogChange={setRecommendations}
                        diagrams={messageDiagramList(savedDiagrams)}
                        onOpenDiagram={id => {
                            closePanel();
                            window.requestAnimationFrame(() => openMessageDiagram(id));
                        }}
                        onDiscuss={prompt => {
                            closePanel();
                            setInput(previous => previous.trim() ? `${previous}\n\n${prompt}` : prompt);
                            window.requestAnimationFrame(() => {
                                document.getElementById('free-composer')?.focus();
                                document.getElementById('free-composer')?.scrollIntoView({ block: 'nearest' });
                            });
                        }}
                    /></div>
                    <ProfileScoresPanel questionnaireType={questionnaireType} groups={scoreGroups}
                        hidden={mobilePanel !== null && mobilePanel !== 'scores'} />
                </>}>
                {openPanel => <>
                    <ChatTranscript
                        ref={messagesRef}
                        announcement={liveAnnouncement}
                        onScroll={(event) => { stickToBottom.current = isNearBottom(event.currentTarget); }}
                        aria-label={t('guided.mode.sandbox')}
                        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-2 sm:p-4 space-y-4 lg:space-y-6"
                    >
                        {messages.length === 0 && <p className="text-sm text-slate-500">{t('experience.choose.sub')}</p>}
                        {messages.map((msg, idx) => (
                            <ChatRow key={idx} role={msg.role === 'user' ? 'user' : 'assistant'} className="animate-fade-in-up">
                                <ChatBubble role={msg.role === 'user' ? 'user' : 'assistant'} className="px-3 py-2 sm:px-3 sm:py-2 lg:px-5 lg:py-3.5">
                                    {msg.role === 'assistant' ? (
                                        msg.content.trim() ? (
                                            <div className="min-w-0 max-w-full overflow-hidden bg-white lg:rounded-lg lg:border lg:border-slate-200/80"
                                                data-voice-source={`free-${sessionId}-${idx}`} data-voice-language={activeLocale} data-voice-counselor={counselorId ?? undefined}>
                                                <ChatMarkdown content={msg.content} locale={activeLocale} errorMessage={t('guided.stepConnError')} />
                                            </div>
                                        ) : <ChatPendingIndicator label={t('guided.thinking')} />
                                    ) : msg.content}
                                </ChatBubble>
                                {msg.role === 'assistant' && msg.content.trim() && (
                                    <ChatMessageActions label={chatLayoutLabel(activeLocale, 'messageActions')}>
                                        <MessageDiagramButton
                                            text={diagramContentForSpeech(msg.content) || msg.content}
                                            locale={activeLocale}
                                            label={t('guided.diagram')}
                                            failedLabel={t('guided.diagramFailed')}
                                            placeholder={t('guided.diagramPrompt')}
                                            submitLabel={t('guided.diagramSend')}
                                            sessionId={sessionId}
                                            sourceText={msg.content}
                                            savedDiagrams={diagramsByMessage}
                                            onSaved={diagram => setSavedDiagrams(previous => [...previous, diagram])}
                                            disabled={isLoading}
                                            renderTrigger={(toggleDiagram, diagramOpen) => <>
                                                <Tooltip content={t('guided.diagram')}><Button type="button" variant="ghost" className={stepButtonClass} aria-label={t('guided.diagram')} disabled={isLoading} aria-expanded={diagramOpen} onClick={toggleDiagram}>
                                                    <GitBranch className="h-4 w-4" aria-hidden="true" />
                                                </Button></Tooltip>
                                                {diagramContentForSpeech(msg.content) && <ListenButton id={`free-${sessionId}-${idx}`} text={diagramContentForSpeech(msg.content)} language={activeLocale} counselorId={counselorId} className={stepButtonClass} />}
                                            </>}
                                        />
                                    </ChatMessageActions>
                                )}
                            </ChatRow>
                        ))}
                        {isLoading && !continuation.pending && !awaitingAssistantBubble && <ChatPending label={t('guided.processing')} />}
                    </ChatTranscript>
                    <ChatContinuation locale={activeLocale} {...continuation} />
                    <form onSubmit={handleSend} className="border-t border-slate-100 bg-white">
                        <div className="p-3 sm:p-4">
                            <div className="relative flex items-end gap-2">
                                {options(openPanel)}
                                <ChatComposerInput
                                    id="free-composer"
                                    hidden={voiceMode}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder={chatLayoutLabel(activeLocale, 'write')}
                                    aria-label={t('guided.input.placeholder')}
                                />
                                <AudioInput value={input} onChange={setInput} onBusyChange={setAudioBusy}
                                    onSend={(text, onPartial) => handleSend({ preventDefault() {} }, text, true, onPartial)}
                                    voiceMode={voiceMode} onExitVoice={() => setVoiceMode(false)} counselorId={counselorId}
                                    voiceOptionsContainer={voiceOptionsContainer}
                                    composerId="free-composer" sessionKey={`${sessionId}:free`} disabled={isLoading} />
                                {!voiceMode && <ChatSendButton loading={isLoading} onStop={stopGeneration} disabled={!input.trim() || audioBusy} sendLabel={t('chat.send')} stopLabel={t('chat.stop')} />}
                            </div>
                        </div>
                    </form>
                </>}
            </ChatWorkspace>
        </div>
    );
}
