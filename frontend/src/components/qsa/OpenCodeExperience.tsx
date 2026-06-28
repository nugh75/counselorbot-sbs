'use client';

import { FormEvent, KeyboardEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    AlertCircle,
    BarChart3,
    Eye,
    FileText,
    Monitor,
    RefreshCw,
    Send,
    Square,
    Terminal,
    ThumbsDown,
    ThumbsUp,
} from 'lucide-react';
import { createTerminalSession, TerminalSession } from '@/lib/opencode-terminal';
import { streamChat } from '@/lib/chat-stream';
import { QuestionnaireConfig } from '@/lib/questionnaires';
import { useI18n } from '@/lib/i18n-context';
import '@xterm/xterm/css/xterm.css';

interface OpenCodeExperienceProps {
    scores: Record<string, number>;
    questionnaire: QuestionnaireConfig;
    pdfToken?: string;
    sessionId: string;
    locale: string;
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    responseId?: string;
    feedback?: boolean;
}

type ViewMode = 'chat' | 'terminal';

export function OpenCodeExperience({
    scores,
    questionnaire,
    pdfToken,
    sessionId,
    locale,
}: OpenCodeExperienceProps) {
    const { t, tf } = useI18n();
    const terminalRef = useRef<TerminalSession | null>(null);
    const mountRef = useRef<HTMLDivElement | null>(null);
    const workspaceKeyRef = useRef('');
    const sessionIdRef = useRef('');
    const streamingRef = useRef(false);
    const requestRef = useRef<AbortController | null>(null);
    const messagesEndRef = useRef<HTMLDivElement | null>(null);

    const [viewMode, setViewMode] = useState<ViewMode>('chat');
    const [workspaceKey, setWorkspaceKey] = useState('');
    const [openCodeSessionId, setOpenCodeSessionId] = useState('');
    const [graphicalAvailable, setGraphicalAvailable] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [status, setStatus] = useState('');
    const [busy, setBusy] = useState(false);
    const [streaming, setStreaming] = useState(false);
    const [error, setError] = useState('');
    const [showPdf, setShowPdf] = useState(!!pdfToken);

    const invertedSet = useMemo(
        () => new Set(questionnaire.invertedFactors || []),
        [questionnaire],
    );
    const factorNameMap = useMemo(() => {
        const map: Record<string, string> = {};
        for (const factor of questionnaire.factors) {
            map[factor.code] = tf(`factor.${factor.code}.name`, factor.name);
        }
        return map;
    }, [questionnaire, tf]);
    const scoreGroups = useMemo(
        () => questionnaire.factorPrefix
            .filter(prefix => Object.keys(scores).some(key => key.startsWith(prefix)))
            .map(prefix => ({
                prefix,
                entries: Object.entries(scores)
                    .filter(([key]) => key.startsWith(prefix))
                    .sort(([a], [b]) => a.localeCompare(b)),
            })),
        [scores, questionnaire],
    );

    const getBarColor = (code: string, score: number) => {
        const inverted = invertedSet.has(code);
        if (score <= 3) return inverted ? 'bg-green-500' : 'bg-red-500';
        if (score <= 6) return 'bg-yellow-500';
        return inverted ? 'bg-red-500' : 'bg-green-500';
    };
    const prefixColors: Record<string, string> = {
        C: 'text-blue-600',
        A: 'text-purple-600',
        T: 'text-amber-600',
        S: 'text-purple-600',
        K: 'text-indigo-600',
        AD: 'text-green-600',
    };

    const connectTerminal = useCallback((key: string) => {
        terminalRef.current?.destroy();
        const terminal = createTerminalSession();
        terminalRef.current = terminal;
        terminal.connect({ key, onStatus: setStatus });
        setViewMode('terminal');
    }, []);

    const sendGraphicalMessage = useCallback(async (
        message: string,
        seed = false,
        key = workspaceKeyRef.current,
        targetSessionId = sessionIdRef.current,
        initialMessages?: ChatMessage[],
    ) => {
        if (!key || !targetSessionId || streamingRef.current) return;
        const userMessage = message.trim();
        if (!seed && !userMessage) return;

        const base = initialMessages;
        const pending: ChatMessage[] = [
            ...(base || []),
            ...(!seed ? [{ role: 'user' as const, content: userMessage }] : []),
            { role: 'assistant', content: '' },
        ];
        if (base) {
            setMessages(pending);
        } else {
            setMessages(previous => [
                ...previous,
                ...(!seed ? [{ role: 'user' as const, content: userMessage }] : []),
                { role: 'assistant', content: '' },
            ]);
        }
        setInput('');
        streamingRef.current = true;
        setStreaming(true);
        setError('');

        requestRef.current?.abort();
        const controller = new AbortController();
        requestRef.current = controller;
        const updateLast = (content: string) => {
            setMessages(previous => {
                const next = [...previous];
                next[next.length - 1] = { role: 'assistant', content };
                return next;
            });
        };

        try {
            const result = await streamChat(
                { session_id: targetSessionId, message: userMessage, seed },
                updateLast,
                controller.signal,
                undefined,
                `/api/opencode/workspace/${encodeURIComponent(key)}/chat`,
            );
            updateLast(result.response);
            if (result.response_id) {
                setMessages(previous => {
                    const next = [...previous];
                    if (next.length > 0) {
                        next[next.length - 1] = { ...next[next.length - 1], responseId: result.response_id };
                    }
                    return next;
                });
            }
        } catch (caught) {
            if (controller.signal.aborted) return;
            const detail = caught instanceof Error ? caught.message : t('opencode.connectionError');
            updateLast(detail);
            setError(detail);
        } finally {
            if (requestRef.current === controller) requestRef.current = null;
            streamingRef.current = false;
            setStreaming(false);
        }
    }, [t]);

    const startOpenCode = useCallback(async () => {
        setBusy(true);
        setError('');
        try {
            const response = await fetch('/api/opencode/workspace', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    workspace_id: sessionId,
                    questionnaire_type: questionnaire.id,
                    scores,
                    pdf_token: pdfToken || null,
                    locale,
                }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || t('opencode.httpError', { status: response.status }));
            }
            workspaceKeyRef.current = data.key;
            setWorkspaceKey(data.key);
            if (!data.api_available) {
                setGraphicalAvailable(false);
                setError(data.api_error || t('opencode.graphicalUnavailable'));
                connectTerminal(data.key);
                return;
            }

            setGraphicalAvailable(true);
            terminalRef.current?.destroy();
            terminalRef.current = null;
            const history = Array.isArray(data.history) ? data.history : [];
            setViewMode('chat');
            setStatus('connected');
            sessionIdRef.current = data.session_id;
            setOpenCodeSessionId(data.session_id);
            setMessages(history);
            if (data.needs_seed) {
                await sendGraphicalMessage('', true, data.key, data.session_id, history);
            }
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : t('opencode.connectionError'));
        } finally {
            setBusy(false);
        }
    }, [
        connectTerminal,
        locale,
        pdfToken,
        questionnaire.id,
        scores,
        sendGraphicalMessage,
        sessionId,
        t,
    ]);

    const resetChat = useCallback(async () => {
        if (!workspaceKey || busy || streaming) return;
        setBusy(true);
        setError('');
        try {
            const response = await fetch(
                `/api/opencode/workspace/${encodeURIComponent(workspaceKey)}/reset`,
                { method: 'POST' },
            );
            const data = await response.json();
            if (!response.ok) throw new Error(data.detail || t('opencode.connectionError'));
            sessionIdRef.current = data.session_id;
            setOpenCodeSessionId(data.session_id);
            setMessages([]);
            await sendGraphicalMessage('', true, workspaceKey, data.session_id, []);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : t('opencode.connectionError'));
        } finally {
            setBusy(false);
        }
    }, [busy, sendGraphicalMessage, streaming, t, workspaceKey]);

    const stopGeneration = useCallback(() => {
        requestRef.current?.abort();
        requestRef.current = null;
        streamingRef.current = false;
        setStreaming(false);
        if (workspaceKey) {
            void fetch(`/api/opencode/workspace/${encodeURIComponent(workspaceKey)}/abort`, {
                method: 'POST',
            });
        }
    }, [workspaceKey]);

    const syncMemory = useCallback((keepalive = false) => {
        const key = workspaceKeyRef.current;
        if (!key) return;
        void fetch(`/api/opencode/workspace/${encodeURIComponent(key)}/sync-memory`, {
            method: 'POST',
            keepalive,
        }).catch(() => {});
    }, []);

    useEffect(() => {
        startOpenCode();
        const timer = window.setInterval(() => syncMemory(), 5000);
        return () => {
            window.clearInterval(timer);
            syncMemory(true);
            requestRef.current?.abort();
            terminalRef.current?.destroy();
            terminalRef.current = null;
        };
    }, [startOpenCode, syncMemory]);

    useEffect(() => {
        if (viewMode === 'terminal' && mountRef.current && terminalRef.current) {
            terminalRef.current.attach(mountRef.current);
        }
        return () => terminalRef.current?.detach();
    }, [viewMode]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const submitFeedback = async (index: number, helpful: boolean) => {
        const msg = messages[index];
        if (!msg?.responseId || msg.feedback !== undefined) return;
        setMessages(prev => prev.map((it, i) => (i === index ? { ...it, feedback: helpful } : it)));
        try {
            await fetch('/api/strategy-feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    response_id: msg.responseId,
                    strategy_ids: [],
                    questionnaire_type: questionnaire.id,
                    phase: 'opencode',
                    language: locale,
                    helpful,
                }),
            });
        } catch (e) {
            console.error('OpenCode feedback non inviato', e);
        }
    };

    const switchView = () => {
        if (viewMode === 'chat') {
            if (workspaceKey) connectTerminal(workspaceKey);
        } else {
            if (!graphicalAvailable) return;
            terminalRef.current?.destroy();
            terminalRef.current = null;
            setViewMode('chat');
            setStatus('connected');
        }
    };

    const submit = (event: FormEvent) => {
        event.preventDefault();
        void sendGraphicalMessage(input);
    };
    const onInputKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void sendGraphicalMessage(input);
        }
    };

    return (
        <div className="flex w-full flex-col gap-4 xl:h-chat xl:flex-row xl:gap-6">
            <div className="flex min-h-[18rem] max-h-[min(60svh,34rem)] flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:h-full xl:max-h-none xl:min-h-0">
                <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
                    <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-800">
                        <BarChart3 className="w-4 h-4 text-indigo-600" />
                        {t('opencode.studentProfile')}
                    </span>
                    {pdfToken && (
                        <button
                            onClick={() => setShowPdf(current => !current)}
                            className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                                showPdf ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            {showPdf ? <Eye className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                            {showPdf ? t('opencode.scores') : t('opencode.pdf')}
                        </button>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto min-h-0 bg-slate-50/50 p-3 space-y-4">
                    {showPdf && pdfToken ? (
                        <iframe
                            src={`/api/opencode/pdf/${pdfToken}`}
                            className="h-full min-h-[18rem] w-full rounded-lg border border-slate-200 bg-white shadow-inner sm:min-h-[28rem]"
                            title={t('opencode.pdfTitle')}
                        />
                    ) : scoreGroups.length > 0 ? scoreGroups.map(group => (
                        <div key={group.prefix} className="bg-white rounded-lg border border-slate-200 shadow-sm p-3">
                            <div className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${prefixColors[group.prefix] || 'text-slate-600'}`}>
                                {t(`profile.section.${group.prefix}`)}
                            </div>
                            <div className="space-y-2">
                                {group.entries.map(([code, score]) => (
                                    <div key={code} className="space-y-0.5">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="font-semibold text-slate-700">{code}</span>
                                            <span className="text-slate-500 ml-1 truncate">{factorNameMap[code] || code}</span>
                                            <span className="font-bold text-slate-700 ml-auto tabular-nums">{score}/9</span>
                                        </div>
                                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${getBarColor(code, score)}`}
                                                style={{ width: `${(score / 9) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )) : (
                        <div className="bg-white rounded-lg border border-slate-200 p-6 text-center text-sm text-slate-400">
                            {t('opencode.noScores')}
                        </div>
                    )}
                </div>
            </div>

            <div className={`flex min-h-chat min-w-0 flex-1 flex-col overflow-hidden rounded-xl border shadow-md xl:h-full xl:min-h-0 ${
                viewMode === 'chat' ? 'bg-slate-50 border-slate-200' : 'bg-[#0b0f17] border-slate-800'
            }`}>
                <div className={`flex flex-col gap-2 border-b px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4 ${
                    viewMode === 'chat' ? 'bg-white border-slate-200' : 'bg-[#131924] border-slate-800'
                }`}>
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className={`font-semibold text-sm ${viewMode === 'chat' ? 'text-slate-800' : 'text-slate-200'}`}>
                            {t('opencode.chatTitle')}
                        </span>
                        {status && (
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                                status === 'connected'
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-amber-100 text-amber-700'
                            }`}>
                                {t(`opencode.status.${status}`)}
                            </span>
                            )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                        <button
                            onClick={switchView}
                            disabled={!workspaceKey || (viewMode === 'terminal' && !graphicalAvailable)}
                            className={`flex items-center gap-1.5 rounded-lg p-1.5 text-xs transition-colors disabled:opacity-40 ${
                                viewMode === 'chat'
                                    ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                            }`}
                            title={viewMode === 'chat' ? t('opencode.useTerminal') : t('opencode.useGraphical')}
                        >
                            {viewMode === 'chat' ? <Terminal className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
                            {viewMode === 'chat' ? t('opencode.terminal') : t('opencode.graphical')}
                        </button>
                        <button
                            onClick={viewMode === 'chat' ? resetChat : startOpenCode}
                            disabled={busy || streaming}
                            className={`flex items-center gap-1.5 rounded-lg p-1.5 text-xs transition-colors disabled:opacity-50 ${
                                viewMode === 'chat'
                                    ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                            }`}
                            title={t('opencode.restartTitle')}
                        >
                            <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
                            {busy ? t('opencode.restarting') : t('opencode.restart')}
                        </button>
                    </div>
                </div>

                {viewMode === 'terminal' ? (
                    <div className="flex-1 p-2 min-h-0 relative flex flex-col">
                        <div ref={mountRef} className="flex-1 min-h-0 rounded-lg overflow-hidden bg-[#0b0f17] p-2" />
                    </div>
                ) : (
                    <>
                        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 space-y-5">
                            {busy && messages.length === 0 && (
                                <div className="h-full flex items-center justify-center text-sm text-slate-500">
                                    <RefreshCw className="w-4 h-4 mr-2 animate-spin text-indigo-600" />
                                    {t('opencode.connecting')}
                                </div>
                            )}
                            {error && messages.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-center p-6">
                                    <AlertCircle className="w-10 h-10 text-rose-500 mb-3" />
                                    <p className="text-sm text-slate-700">{error}</p>
                                    <button onClick={startOpenCode} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">
                                        {t('opencode.retry')}
                                    </button>
                                </div>
                            )}
                            {messages.map((message, index) => (
                                <div key={index} className={`flex min-w-0 gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`min-w-0 max-w-[92%] break-words rounded-2xl px-4 py-3 text-sm shadow-sm sm:max-w-[85%] ${
                                        message.role === 'user'
                                            ? 'bg-indigo-600 text-white rounded-tr-md'
                                            : 'bg-white border border-slate-200 text-slate-800 rounded-tl-md'
                                    }`}>
                                        {message.role === 'assistant' ? (
                                            <>
                                                {message.content ? (
                                                    <div className="prose prose-sm prose-slate max-w-none break-words prose-p:my-2 prose-ul:my-2 prose-ol:my-2">
                                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                            {message.content}
                                                        </ReactMarkdown>
                                                    </div>
                                                ) : (
                                                    <div className="flex gap-1 py-1">
                                                        <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" />
                                                        <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:120ms]" />
                                                        <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce [animation-delay:240ms]" />
                                                    </div>
                                                )}
                                                {message.responseId && (
                                                    <div className="mt-2 flex items-center gap-1">
                                                        <button
                                                            onClick={() => submitFeedback(index, true)}
                                                            disabled={message.feedback !== undefined}
                                                            title={t('guided.feedback.helpful')}
                                                            className={`p-1 rounded transition-colors disabled:cursor-default ${
                                                                message.feedback === true ? 'text-green-600' : 'text-slate-400 hover:text-green-600'
                                                            }`}
                                                        >
                                                            <ThumbsUp className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => submitFeedback(index, false)}
                                                            disabled={message.feedback !== undefined}
                                                            title={t('guided.feedback.notHelpful')}
                                                            className={`p-1 rounded transition-colors disabled:cursor-default ${
                                                                message.feedback === false ? 'text-red-600' : 'text-slate-400 hover:text-red-600'
                                                            }`}
                                                        >
                                                            <ThumbsDown className="w-3.5 h-3.5" />
                                                        </button>
                                                        {message.feedback !== undefined && (
                                                            <span className="text-xs text-slate-400 ml-1">Grazie!</span>
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        ) : message.content}
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                        <form onSubmit={submit} className="border-t border-slate-200 bg-white p-3 sm:p-4">
                            {error && messages.length > 0 && (
                                <p className="text-xs text-rose-600 mb-2">{error}</p>
                            )}
                            <div className="flex min-w-0 items-end gap-2 rounded-xl border border-slate-300 bg-slate-50 p-2 focus-within:border-transparent focus-within:ring-2 focus-within:ring-indigo-500">
                                <textarea
                                    value={input}
                                    onChange={event => setInput(event.target.value)}
                                    onKeyDown={onInputKeyDown}
                                    disabled={busy || streaming || !openCodeSessionId}
                                    rows={1}
                                    placeholder={t('opencode.placeholder')}
                                    className="max-h-32 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 disabled:opacity-60"
                                />
                                {streaming ? (
                                    <button
                                        type="button"
                                        onClick={stopGeneration}
                                        className="shrink-0 rounded-lg bg-slate-800 p-2.5 text-white hover:bg-slate-900"
                                        title={t('opencode.stop')}
                                    >
                                        <Square className="w-4 h-4 fill-current" />
                                    </button>
                                ) : (
                                    <button
                                        type="submit"
                                        disabled={!input.trim() || busy || !openCodeSessionId}
                                        className="shrink-0 rounded-lg bg-indigo-600 p-2.5 text-white hover:bg-indigo-700 disabled:opacity-40"
                                        title={t('opencode.send')}
                                    >
                                        <Send className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            <p className="mt-2 text-[11px] text-slate-400 text-center">
                                {t('opencode.inputHint')}
                            </p>
                        </form>
                    </>
                )}
            </div>
        </div>
    );
}
