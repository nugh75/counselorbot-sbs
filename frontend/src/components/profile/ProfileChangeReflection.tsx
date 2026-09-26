'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, Loader2, RefreshCw, Save, Send } from 'lucide-react';
import { ResponseFormatSelector } from '@/components/ui/ResponseFormatSelector';
import { useResponseFormat } from '@/lib/use-response-format';
import { ChatContinuation, useChatContinuation } from '@/components/ui/ChatContinuation';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { toast } from '@/components/ui/Toast';

interface LearnerProfileData {
    context?: string;
    goal?: string;
    main_difficulty?: string;
    strengths?: string;
    weaknesses?: string;
    notes?: string;
    gender?: string;
    age?: string;
    school_class?: string;
    school_year?: string;
}

interface Revision {
    id: number;
    data: LearnerProfileData;
    source: string;
    session_id?: string | null;
    created_at: string;
}

interface Reflection {
    id: number;
    note: string;
    current_revision_id?: number | null;
    previous_revision_id?: number | null;
    session_id?: string | null;
    created_at: string;
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

const PROFILE_FIELDS: { key: keyof LearnerProfileData; labelKey: string }[] = [
    { key: 'age', labelKey: 'profileChanges.field.age' },
    { key: 'gender', labelKey: 'profileChanges.field.gender' },
    { key: 'school_class', labelKey: 'profileChanges.field.schoolClass' },
    { key: 'school_year', labelKey: 'profileChanges.field.schoolYear' },
    { key: 'context', labelKey: 'profileChanges.field.context' },
    { key: 'goal', labelKey: 'profileChanges.field.goal' },
    { key: 'main_difficulty', labelKey: 'profileChanges.field.difficulty' },
    { key: 'strengths', labelKey: 'profileChanges.field.strengths' },
    { key: 'weaknesses', labelKey: 'profileChanges.field.weaknesses' },
    { key: 'notes', labelKey: 'profileChanges.field.notes' },
];

type FieldLabel = { key: keyof LearnerProfileData; label: string };

function valueOf(revision: Revision | undefined, key: keyof LearnerProfileData): string {
    return (revision?.data?.[key] || '').trim();
}

function formatRevision(revision: Revision | undefined, fields: FieldLabel[], lang: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
    if (!revision) return t('profileChanges.context.noRevision');
    const lines = fields
        .map((field) => {
            const value = valueOf(revision, field.key);
            return value ? `- ${field.label}: ${value}` : '';
        })
        .filter(Boolean);
    return [t('profileChanges.context.revision', { id: revision.id, date: new Date(revision.created_at).toLocaleString(lang) }), ...lines].join('\n');
}

export function ProfileChangeReflection({ lang }: { lang: string }) {
    const { streamChat, ...continuation } = useChatContinuation();
    const { t } = useI18n();
    const [history, setHistory] = useState<Revision[]>([]);
    const [reflections, setReflections] = useState<Reflection[]>([]);
    const [revIndex, setRevIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [assistantOpen, setAssistantOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [responseFormat, setResponseFormat] = useResponseFormat('profile-reflection');
    const [chatInput, setChatInput] = useState('');
    const [chatSessionId, setChatSessionId] = useState<string | undefined>(undefined);
    const [chatConversationId, setChatConversationId] = useState<string | undefined>(undefined);
    const [chatLoading, setChatLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [historyRes, reflectionsRes] = await Promise.all([
                apiFetch('/api/user/learner-profile/history'),
                apiFetch('/api/user/learner-profile/reflections'),
            ]);
            setHistory(historyRes.ok ? await historyRes.json() : []);
            setReflections(reflectionsRes.ok ? await reflectionsRes.json() : []);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const current = history[revIndex];
    const previous = history[revIndex + 1];
    const profileFields = useMemo(
        () => PROFILE_FIELDS.map((field) => ({ key: field.key, label: t(field.labelKey) })),
        [t],
    );

    const changes = useMemo(() => {
        if (!current || !previous) return [];
        return profileFields.map((field) => {
            const before = valueOf(previous, field.key);
            const after = valueOf(current, field.key);
            return before !== after ? { ...field, before, after } : null;
        }).filter(Boolean) as { key: keyof LearnerProfileData; label: string; before: string; after: string }[];
    }, [current, previous, profileFields]);

    const studentContext = useMemo(() => {
        const reflectionLines = reflections.slice(0, 5).map((r) => `- ${new Date(r.created_at).toLocaleDateString(lang)}: ${r.note}`);
        return [
            t('profileChanges.context.currentProfile'),
            formatRevision(current, profileFields, lang, t),
            '',
            t('profileChanges.context.previousProfile'),
            formatRevision(previous, profileFields, lang, t),
            '',
            t('profileChanges.context.detectedChanges'),
            changes.length
                ? changes.map((c) => `- ${c.label}: ${t('profileChanges.before').toLowerCase()} "${c.before || '-'}", ${t('profileChanges.now').toLowerCase()} "${c.after || '-'}"`).join('\n')
                : t('profileChanges.noTextChanges'),
            '',
            t('profileChanges.context.savedReflections'),
            reflectionLines.length ? reflectionLines.join('\n') : t('profileChanges.context.noSavedReflections'),
        ].join('\n');
    }, [changes, current, previous, reflections, lang, profileFields, t]);

    const saveProfileReflection = async () => {
        const res = await apiFetch('/api/user/learner-profile/reflections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                note,
                current_revision_id: current?.id ?? null,
                previous_revision_id: previous?.id ?? null,
                session_id: null,
            }),
        });
        if (!res.ok) throw new Error('Save failed');
    };

    const saveReflection = async () => {
        if (!note.trim()) return;
        setSaving(true);
        try {
            await saveProfileReflection();
            setNote('');
            await load();
            toast.success(t('profileChanges.saved'));
        } catch (e) {
            console.error('Failed to save reflection', e);
            toast.error(t('toast.error'));
        } finally {
            setSaving(false);
        }
    };

    const sendToAssistant = async (customQuestion?: string) => {
        const question = (customQuestion || chatInput).trim();
        if (!question || chatLoading) return;
        setChatInput('');
        setMessages((items) => [...items, { role: 'user', content: question }, { role: 'assistant', content: '' }]);
        setChatLoading(true);
        try {
            const result = await streamChat(
                {
                    message: question,
                    response_format: responseFormat,
                    audience: 'studente',
                    collection: 'counselorbot',
                    language: lang,
                    session_id: chatSessionId,
                    conversation_id: chatConversationId,
                    student_context: studentContext,
                },
                (full) => {
                    setMessages((items) => {
                        const next = [...items];
                        next[next.length - 1] = { role: 'assistant', content: full };
                        return next;
                    });
                },
                undefined,
                undefined,
                '/api/site-chat/stream',
            );
            setMessages((items) => {
                const next = [...items];
                next[next.length - 1] = { role: 'assistant', content: result.response };
                return next;
            });
            if (result.session_id) setChatSessionId(result.session_id);
            if (result.conversation_id) setChatConversationId(result.conversation_id);
        } catch (e) {
            const message = e instanceof Error ? e.message : t('toast.error');
            setMessages((items) => {
                const next = [...items];
                next[next.length - 1] = { role: 'assistant', content: `${t('profileChanges.errorPrefix')}: ${message}` };
                return next;
            });
        } finally {
            setChatLoading(false);
        }
    };

    const startAssistant = () => {
        setAssistantOpen(true);
        if (messages.length === 0) {
            void sendToAssistant(t('profileChanges.assistantProfileQuestion'));
        }
    };

    const selectClass = 'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400';

    const reflectionBlock = (
        <div className="space-y-3 border-t border-slate-100 pt-3">
            <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('profileChanges.reflectionLabel')}</span>
                <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder={t('profileChanges.reflectionPlaceholder')}
                />
            </label>
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => void saveReflection()}
                    disabled={saving || !note.trim()}
                    className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    <Save className="h-4 w-4" />
                    {t('profileChanges.saveReflection')}
                </button>
                <button
                    type="button"
                    onClick={startAssistant}
                    className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                >
                    <Bot className="h-4 w-4" />
                    {t('profileChanges.assistantButton')}
                </button>
            </div>
            {reflections.length > 0 && (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                    {reflections.slice(0, 3).map((reflection) => (
                        <div key={reflection.id} className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                {new Date(reflection.created_at).toLocaleDateString(lang)}
                            </div>
                            {reflection.note}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <section className="glass-panel p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-slate-800">
                        {t('profileChanges.title')}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">{t('profileChanges.subtitle')}</p>
                </div>
                <button
                    type="button"
                    onClick={() => void load()}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                    <RefreshCw className="h-3.5 w-3.5" />
                    {t('profileChanges.refresh')}
                </button>
            </div>

            {loading ? (
                <div className="text-sm text-slate-500">{t('profileChanges.loading')}</div>
            ) : !current ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                    {t('profileChanges.profileEmpty')}
                </div>
            ) : (
                <div className="space-y-4">
                    <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('profileChanges.selectChange')}</span>
                        <select
                            value={revIndex}
                            onChange={(event) => setRevIndex(Number(event.target.value))}
                            className={selectClass}
                        >
                            {history.map((rev, index) => {
                                const prev = history[index + 1];
                                const label = prev
                                    ? t('profileChanges.optionCompared', { date: new Date(rev.created_at).toLocaleString(lang), previousDate: new Date(prev.created_at).toLocaleDateString(lang) })
                                    : t('profileChanges.optionFirstRevision', { date: new Date(rev.created_at).toLocaleString(lang) });
                                return <option key={rev.id} value={index}>{label}</option>;
                            })}
                        </select>
                    </label>

                    {!previous ? (
                        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
                            {t('profileChanges.firstRevision')}
                        </div>
                    ) : changes.length ? (
                        <div className="space-y-2">
                            {changes.map((change) => (
                                <div key={change.key} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                                    <div className="font-semibold text-slate-800">{change.label}</div>
                                    <div className="mt-1 space-y-1 text-xs text-slate-500">
                                        <div><span className="font-semibold text-slate-500">{t('profileChanges.before')}:</span> {change.before || '-'}</div>
                                        <div><span className="font-semibold text-indigo-500">{t('profileChanges.now')}:</span> {change.after || '-'}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
                            {t('profileChanges.noTextChanges')}
                        </div>
                    )}

                    {reflectionBlock}
                </div>
            )}

            {assistantOpen && (
                <div className="rounded-xl border border-indigo-100 bg-white p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                        {t('profileChanges.assistantTitle')}
                    </div>
                    <div className="max-h-80 overflow-y-auto space-y-3 rounded-lg bg-slate-50 p-3">
                        {messages.map((message, index) => (
                            <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${message.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-800'}`}>
                                    {!message.content && message.role === 'assistant' ? (
                                        <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                                    ) : (
                                        <div className="prose prose-sm max-w-none prose-p:my-1">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    <ChatContinuation locale={lang} {...continuation} />
                    <ResponseFormatSelector value={responseFormat} onChange={setResponseFormat} disabled={chatLoading} />
                    <div className="flex gap-2">
                        <textarea
                            value={chatInput}
                            onChange={(event) => setChatInput(event.target.value)}
                            rows={2}
                            className="flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            placeholder={t('profileChanges.chatPlaceholder')}
                        />
                        <button
                            type="button"
                            onClick={() => void sendToAssistant()}
                            disabled={chatLoading || !chatInput.trim()}
                            className="inline-flex items-center rounded-md bg-indigo-600 px-4 text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
