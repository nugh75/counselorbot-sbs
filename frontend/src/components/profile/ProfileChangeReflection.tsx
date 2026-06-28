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

interface BookletReflection {
    note: string;
    created_at: string;
}

interface BookletScheda {
    id: number;
    questionnaire_type: string;
    data: Record<string, unknown>;
    updated_at?: string | null;
}

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
}

const BOOKLET_TYPES = ['QSA', 'QSAr', 'ZTPI', 'SAVICKAS', 'QPCS', 'QPCC', 'QAP'];

const PROFILE_FIELDS: { key: keyof LearnerProfileData; label: string }[] = [
    { key: 'age', label: 'Eta' },
    { key: 'gender', label: 'Genere' },
    { key: 'school_class', label: 'Classe / contesto' },
    { key: 'school_year', label: 'Anno / percorso' },
    { key: 'context', label: 'Contesto' },
    { key: 'goal', label: 'Obiettivo' },
    { key: 'main_difficulty', label: 'Difficolta principale' },
    { key: 'tried', label: 'Strategie gia provate' },
    { key: 'notes', label: 'Note' },
];

// Campi della scheda libretto da mostrare (in ordine), uno per riga.
const BOOKLET_FIELDS: { key: string; label: string }[] = [
    { key: 'title', label: 'Titolo' },
    { key: 'strength', label: 'Punti di forza da valorizzare' },
    { key: 'growth_area', label: 'Aree da migliorare' },
    { key: 'motivation', label: 'Motivazione' },
    { key: 'objective', label: 'Obiettivo' },
    { key: 'strategy', label: 'Strategia' },
    { key: 'period', label: 'Periodo' },
    { key: 'commitment', label: 'Impegno rispettato' },
    { key: 'difficulties', label: 'Difficolta incontrate' },
    { key: 'improvements', label: 'Miglioramenti osservati' },
    { key: 'discovery', label: 'Cosa ho capito o scoperto' },
    { key: 'student_notes', label: 'Note' },
    { key: 'final_satisfaction', label: 'Valutazione finale' },
    { key: 'final_observations', label: 'Osservazioni finali' },
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

function bookletFieldValue(data: Record<string, unknown>, key: string): string {
    if (key === 'period') {
        const parts = [data.period_start, data.period_end].map((v) => (v == null ? '' : String(v).trim())).filter(Boolean);
        return parts.join(' - ');
    }
    const raw = data[key];
    if (Array.isArray(raw)) return raw.map((item) => String(item).trim()).filter(Boolean).join(', ');
    if (raw == null) return '';
    return String(raw).trim();
}

function bookletTitle(scheda: BookletScheda): string {
    const raw = scheda.data?.title;
    const title = typeof raw === 'string' ? raw.trim() : '';
    return title || `Scheda ${scheda.id}`;
}

function bookletReflections(scheda: BookletScheda | undefined): BookletReflection[] {
    const raw = scheda?.data?.reflections;
    if (!Array.isArray(raw)) return [];
    return raw
        .map((item) => {
            if (item && typeof item === 'object') {
                const obj = item as Record<string, unknown>;
                return { note: String(obj.note ?? '').trim(), created_at: String(obj.created_at ?? '') };
            }
            return { note: String(item ?? '').trim(), created_at: '' };
        })
        .filter((r) => r.note);
}

export function ProfileChangeReflection({ lang }: { lang: string }) {
    const { t } = useI18n();
    const [mode, setMode] = useState<'profilo' | 'libretto'>('profilo');
    const [history, setHistory] = useState<Revision[]>([]);
    const [reflections, setReflections] = useState<Reflection[]>([]);
    const [booklets, setBooklets] = useState<BookletScheda[]>([]);
    const [revIndex, setRevIndex] = useState(0);
    const [bookletId, setBookletId] = useState<number | null>(null);
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
            const [historyRes, reflectionsRes, ...bookletRes] = await Promise.all([
                fetch('/api/user/learner-profile/history'),
                fetch('/api/user/learner-profile/reflections'),
                ...BOOKLET_TYPES.map((type) => fetch(`/api/user/student-booklets/instrument/${encodeURIComponent(type)}/list`)),
            ]);
            setHistory(historyRes.ok ? await historyRes.json() : []);
            setReflections(reflectionsRes.ok ? await reflectionsRes.json() : []);
            const schede: BookletScheda[] = [];
            for (const res of bookletRes) {
                if (res.ok) {
                    const list = await res.json();
                    if (Array.isArray(list)) schede.push(...list);
                }
            }
            schede.sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime());
            setBooklets(schede);
            setBookletId((prev) => (prev != null && schede.some((s) => s.id === prev) ? prev : schede[0]?.id ?? null));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const current = history[revIndex];
    const previous = history[revIndex + 1];
    const selectedScheda = useMemo(() => booklets.find((s) => s.id === bookletId), [booklets, bookletId]);

    const changes = useMemo(() => {
        if (!current || !previous) return [];
        return PROFILE_FIELDS.map((field) => {
            const before = valueOf(previous, field.key);
            const after = valueOf(current, field.key);
            return before !== after ? { ...field, before, after } : null;
        }).filter(Boolean) as { key: keyof LearnerProfileData; label: string; before: string; after: string }[];
    }, [current, previous]);

    const bookletRows = useMemo(() => {
        if (!selectedScheda) return [];
        return BOOKLET_FIELDS
            .map((field) => ({ label: field.label, value: bookletFieldValue(selectedScheda.data, field.key) }))
            .filter((row) => row.value);
    }, [selectedScheda]);

    const currentBookletReflections = useMemo(() => bookletReflections(selectedScheda), [selectedScheda]);

    const studentContext = useMemo(() => {
        if (mode === 'libretto') {
            if (!selectedScheda) return 'Nessuna scheda del libretto selezionata.';
            const rows = bookletRows.map((row) => `- ${row.label}: ${row.value}`);
            const reflLines = currentBookletReflections.slice(0, 5).map((r) => `- ${r.created_at ? new Date(r.created_at).toLocaleDateString(lang) + ': ' : ''}${r.note}`);
            return [
                `SCHEDA DEL LIBRETTO (${selectedScheda.questionnaire_type})`,
                rows.length ? rows.join('\n') : 'Scheda ancora vuota.',
                '',
                'RIFLESSIONI SALVATE SULLA SCHEDA',
                reflLines.length ? reflLines.join('\n') : 'Nessuna riflessione salvata.',
            ].join('\n');
        }
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
        ].join('\n');
    }, [mode, selectedScheda, bookletRows, currentBookletReflections, changes, current, previous, reflections, lang]);

    const saveProfileReflection = async () => {
        const res = await fetch('/api/user/learner-profile/reflections', {
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

    const saveBookletReflection = async () => {
        if (!selectedScheda) throw new Error('Nessuna scheda selezionata');
        const nextReflections = [
            ...currentBookletReflections,
            { note: note.trim(), created_at: new Date().toISOString() },
        ];
        const res = await fetch(`/api/user/student-booklets/id/${selectedScheda.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { ...selectedScheda.data, reflections: nextReflections } }),
        });
        if (!res.ok) throw new Error('Save failed');
    };

    const saveReflection = async () => {
        if (!note.trim()) return;
        setSaving(true);
        try {
            if (mode === 'libretto') {
                await saveBookletReflection();
            } else {
                await saveProfileReflection();
            }
            setNote('');
            await load();
            toast.success('Riflessione salvata.');
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
            const question = mode === 'libretto'
                ? 'Aiutami a riflettere su questa scheda del libretto: cosa funziona, cosa posso migliorare e quale prossimo passo realistico posso scegliere?'
                : 'Aiutami a ragionare sui cambiamenti del mio profilo: cosa e cambiato, cosa resta stabile e quale prossimo passo realistico posso scegliere?';
            void sendToAssistant(question);
        }
    };

    const selectClass = 'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400';

    const reflectionBlock = (
        <div className="space-y-3 border-t border-slate-100 pt-3">
            <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">La tua riflessione</span>
                <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="Che cosa noti? Quale piccolo passo vuoi provare?"
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
            {mode === 'profilo' && reflections.length > 0 && (
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
    );

    return (
        <section className="glass-panel p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <History className="h-5 w-5 text-indigo-600" />
                        Cambiamenti del profilo
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">Rivedi come e cambiato il tuo profilo o una scheda del libretto e salva una riflessione personale.</p>
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

            {/* Cosa analizzare: profilo o scheda del libretto */}
            <div className="inline-flex rounded-md border border-slate-200 bg-white p-1 text-sm font-semibold">
                <button
                    type="button"
                    onClick={() => { setMode('profilo'); setAssistantOpen(false); setMessages([]); }}
                    className={`rounded px-3 py-1.5 ${mode === 'profilo' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                    Profilo
                </button>
                <button
                    type="button"
                    onClick={() => { setMode('libretto'); setAssistantOpen(false); setMessages([]); }}
                    className={`rounded px-3 py-1.5 ${mode === 'libretto' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                    Libretto
                </button>
            </div>

            {loading ? (
                <div className="text-sm text-slate-400">Caricamento...</div>
            ) : mode === 'profilo' ? (
                !current ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                        Compila il tuo profilo personale per iniziare a osservare i cambiamenti.
                    </div>
                ) : (
                    <div className="space-y-4">
                        <label className="block">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quale cambiamento analizzare</span>
                            <select
                                value={revIndex}
                                onChange={(event) => setRevIndex(Number(event.target.value))}
                                className={selectClass}
                            >
                                {history.map((rev, index) => {
                                    const prev = history[index + 1];
                                    const label = prev
                                        ? `${new Date(rev.created_at).toLocaleString(lang)} (rispetto a ${new Date(prev.created_at).toLocaleDateString(lang)})`
                                        : `${new Date(rev.created_at).toLocaleString(lang)} (prima revisione)`;
                                    return <option key={rev.id} value={index}>{label}</option>;
                                })}
                            </select>
                        </label>

                        {!previous ? (
                            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
                                Questa e la prima revisione: salva almeno due revisioni del profilo per vedere il confronto dei cambiamenti.
                            </div>
                        ) : changes.length ? (
                            <div className="space-y-2">
                                {changes.map((change) => (
                                    <div key={change.key} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                                        <div className="font-semibold text-slate-800">{change.label}</div>
                                        <div className="mt-1 space-y-1 text-xs text-slate-500">
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

                        {reflectionBlock}
                    </div>
                )
            ) : (
                booklets.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                        Non hai ancora schede del libretto. Creane una dal taccuino per poterci riflettere.
                    </div>
                ) : (
                    <div className="space-y-4">
                        <label className="block">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quale scheda del libretto</span>
                            <select
                                value={bookletId ?? ''}
                                onChange={(event) => setBookletId(Number(event.target.value))}
                                className={selectClass}
                            >
                                {booklets.map((scheda) => (
                                    <option key={scheda.id} value={scheda.id}>
                                        {scheda.questionnaire_type} · {bookletTitle(scheda)}
                                    </option>
                                ))}
                            </select>
                        </label>

                        {bookletRows.length ? (
                            <div className="space-y-2">
                                {bookletRows.map((row) => (
                                    <div key={row.label} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                                        <div className="font-semibold text-slate-800">{row.label}</div>
                                        <div className="mt-1 text-xs text-slate-600">{row.value}</div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-500">
                                Questa scheda e ancora vuota: compilala dal taccuino per poterci riflettere.
                            </div>
                        )}

                        {currentBookletReflections.length > 0 && (
                            <div className="space-y-2 border-t border-slate-100 pt-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Riflessioni su questa scheda</div>
                                {currentBookletReflections.slice().reverse().slice(0, 3).map((reflection, index) => (
                                    <div key={index} className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">
                                        {reflection.created_at && (
                                            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                                {new Date(reflection.created_at).toLocaleDateString(lang)}
                                            </div>
                                        )}
                                        {reflection.note}
                                    </div>
                                ))}
                            </div>
                        )}

                        {reflectionBlock}
                    </div>
                )
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
                            placeholder="Scrivi una domanda..."
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
