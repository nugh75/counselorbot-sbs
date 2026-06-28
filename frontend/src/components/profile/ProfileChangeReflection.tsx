'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, History, Loader2, RefreshCw, Save, Send } from 'lucide-react';
import { streamChat } from '@/lib/chat-stream';
import { useI18n } from '@/lib/i18n-context';
import { toast } from '@/components/ui/Toast';

interface LearnerProfileData {
    context?: string;
    goal?: string;
    main_difficulty?: string;
    tried?: string;
    notes?: string;
    gender?: string;
    age?: string;
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

interface QuestionnaireResult {
    id: number;
    session_id: string;
    questionnaire_type: string;
    scores: Record<string, number> | null;
    submitted_at: string;
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

const PROFILE_FIELDS: { key: keyof LearnerProfileData; label: string }[] = [
    { key: 'age', label: 'Eta' },
    { key: 'gender', label: 'Genere' },
    { key: 'context', label: 'Contesto' },
    { key: 'goal', label: 'Obiettivo' },
    { key: 'main_difficulty', label: 'Difficolta principale' },
    { key: 'tried', label: 'Strategie gia provate' },
    { key: 'notes', label: 'Note' },
];

function valueOf(revision: Revision | undefined, key: keyof LearnerProfileData): string {
    return (revision?.data?.[key] || '').trim();
}

function formatRevision(revision: Revision | undefined): string {
    if (!revision) return 'Nessuna revisione disponibile.';
    const lines = PROFILE_FIELDS
        .map((field) => {
            const value = valueOf(revision, field.key);
            return value ? `- ${field.label}: ${value}` : '';
        })
        .filter(Boolean);
    return [`Revisione ${revision.id} (${new Date(revision.created_at).toLocaleString('it-IT')})`, ...lines].join('\n');
}

export function ProfileChangeReflection({ selectedSession, lang }: { selectedSession: QuestionnaireResult | null; lang: string }) {
    const { t } = useI18n();
    const [history, setHistory] = useState<Revision[]>([]);
    const [reflections, setReflections] = useState<Reflection[]>([]);
    const [loading, setLoading] = useState(true);
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [assistantOpen, setAssistantOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [chatSessionId, setChatSessionId] = useState<string | undefined>(undefined);
    const [chatLoading, setChatLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [historyRes, reflectionsRes] = await Promise.all([
                fetch('/api/user/learner-profile/history'),
                fetch('/api/user/learner-profile/reflections'),
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

    const current = history[0];
    const previous = history[1];

    const changes = useMemo(() => {
        if (!current || !previous) return [];
        return PROFILE_FIELDS.map((field) => {
            const before = valueOf(previous, field.key);
            const after = valueOf(current, field.key);
            return before !== after ? { ...field, before, after } : null;
        }).filter(Boolean) as { key: keyof LearnerProfileData; label: string; before: string; after: string }[];
    }, [current, previous]);

    const studentContext = useMemo(() => {
        const selected = selectedSession
            ? [
                `Compilazione selezionata: ${selectedSession.questionnaire_type}`,
                `Data compilazione: ${new Date(selectedSession.submitted_at).toLocaleString(lang)}`,
                `Sessione: ${selectedSession.session_id}`,
                selectedSession.scores ? `Punteggi: ${Object.entries(selectedSession.scores).map(([k, v]) => `${k}=${v}/9`).join(', ')}` : '',
            ].filter(Boolean).join('\n')
            : 'Nessuna compilazione selezionata.';
        const reflectionLines = reflections.slice(0, 5).map((r) => `- ${new Date(r.created_at).toLocaleDateString(lang)}: ${r.note}`);
        return [
            'PROFILO CORRENTE',
            formatRevision(current),
            '',
            'PROFILO PRECEDENTE',
            formatRevision(previous),
            '',
            'CAMBIAMENTI RILEVATI',
            changes.length ? changes.map((c) => `- ${c.label}: prima "${c.before || '-'}", ora "${c.after || '-'}"`).join('\n') : 'Nessun cambiamento testuale rilevato.',
            '',
            'RIFLESSIONI SALVATE',
            reflectionLines.length ? reflectionLines.join('\n') : 'Nessuna riflessione salvata.',
            '',
            selected,
        ].join('\n');
    }, [changes, current, previous, reflections, selectedSession, lang]);

    const saveReflection = async () => {
        if (!note.trim()) return;
        setSaving(true);
        try {
            const res = await fetch('/api/user/learner-profile/reflections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    note,
                    current_revision_id: current?.id ?? null,
                    previous_revision_id: previous?.id ?? null,
                    session_id: selectedSession?.session_id ?? null,
                }),
            });
            if (!res.ok) throw new Error('Save failed');
            setNote('');
            await load();
            toast.success('Riflessione salvata.');
        } catch (e) {
            console.error('Failed to save profile reflection', e);
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
                    audience: 'studente',
                    collection: 'counselorbot',
                    language: lang,
                    session_id: chatSessionId,
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
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Errore nella risposta.';
            setMessages((items) => {
                const next = [...items];
                next[next.length - 1] = { role: 'assistant', content: `Errore: ${message}` };
                return next;
            });
        } finally {
            setChatLoading(false);
        }
    };

    const startAssistant = () => {
        setAssistantOpen(true);
        if (messages.length === 0) {
            void sendToAssistant('Aiutami a ragionare sui cambiamenti del mio profilo: cosa e cambiato, cosa resta stabile e quale prossimo passo realistico posso scegliere?');
        }
    };

    return (
        <section className="glass-panel p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <History className="h-5 w-5 text-indigo-600" />
                        Cambiamenti del profilo
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">Rivedi come e cambiato il tuo profilo e salva una riflessione personale.</p>
                </div>
                <button
                    type="button"
                    onClick={() => void load()}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Aggiorna
                </button>
            </div>

            {loading ? (
                <div className="text-sm text-slate-400">Caricamento cambiamenti...</div>
            ) : !current ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                    Compila il tuo profilo personale per iniziare a osservare i cambiamenti.
                </div>
            ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-3">
                        <div className="rounded-lg border border-slate-200 bg-white p-4">
                            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Ultima revisione</div>
                            <div className="mt-1 text-sm font-semibold text-slate-800">{new Date(current.created_at).toLocaleString(lang)}</div>
                        </div>
                        {!previous ? (
                            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
                                Salva almeno due revisioni del profilo per vedere il confronto dei cambiamenti.
                            </div>
                        ) : changes.length ? (
                            <div className="space-y-2">
                                {changes.map((change) => (
                                    <div key={change.key} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                                        <div className="font-semibold text-slate-800">{change.label}</div>
                                        <div className="mt-1 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                                            <div><span className="font-semibold text-slate-400">Prima:</span> {change.before || '-'}</div>
                                            <div><span className="font-semibold text-indigo-500">Ora:</span> {change.after || '-'}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
                                Nessun cambiamento testuale rispetto alla revisione precedente.
                            </div>
                        )}
                    </div>

                    <div className="space-y-3">
                        <label className="block">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">La tua riflessione</span>
                            <textarea
                                value={note}
                                onChange={(event) => setNote(event.target.value)}
                                rows={4}
                                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                placeholder="Che cosa noti di diverso? Quale piccolo passo vuoi provare?"
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
                                Salva riflessione
                            </button>
                            <button
                                type="button"
                                onClick={startAssistant}
                                className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"
                            >
                                <Bot className="h-4 w-4" />
                                Ragiona con l&apos;assistente
                            </button>
                        </div>
                        {reflections.length > 0 && (
                            <div className="space-y-2 border-t border-slate-100 pt-3">
                                {reflections.slice(0, 3).map((reflection) => (
                                    <div key={reflection.id} className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
                                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                            {new Date(reflection.created_at).toLocaleDateString(lang)}
                                        </div>
                                        {reflection.note}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {assistantOpen && (
                <div className="rounded-xl border border-indigo-100 bg-white p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-800">
                        <Bot className="h-4 w-4 text-indigo-600" />
                        Assistente sul cambiamento
                    </div>
                    <div className="max-h-80 overflow-y-auto space-y-3 rounded-lg bg-slate-50 p-3">
                        {messages.map((message, index) => (
                            <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${message.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-800'}`}>
                                    {!message.content && message.role === 'assistant' ? (
                                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                                    ) : (
                                        <div className="prose prose-sm max-w-none prose-p:my-1">
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <textarea
                            value={chatInput}
                            onChange={(event) => setChatInput(event.target.value)}
                            rows={2}
                            className="flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            placeholder="Scrivi una domanda sui tuoi cambiamenti..."
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
