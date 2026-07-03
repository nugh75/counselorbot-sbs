'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { apiFetch } from '@/lib/auth';
import { ChevronDown, ChevronRight, MessageSquare, RefreshCw, Send, StickyNote, Trash2 } from 'lucide-react';

interface StudentResult {
    id: number;
    session_id: string;
    questionnaire_type: string;
    scores: Record<string, number> | null;
    submitted_at: string | null;
}

interface PlanStudent {
    username: string;
    telegram_linked: boolean;
    learner_profile: Record<string, unknown> | null;
    results: StudentResult[];
}

interface TeacherNote {
    id: number;
    username: string;
    author_username: string;
    kind: string;
    text: string;
    visible_to_student: boolean;
    telegram_delivered: boolean | null;
    created_at: string | null;
}

// ponytail: testi inline it/en come il resto della UI Telegram.
const TEXTS = {
    it: {
        students: 'Studenti',
        empty: 'Nessuno studente ha ancora risultati in questo piano.',
        telegram: 'Telegram collegato',
        profile: 'Modello del discente',
        transcript: 'Conversazione',
        notes: 'Note',
        notePlaceholder: 'Nuova nota sullo studente...',
        visible: 'Visibile allo studente',
        addNote: 'Salva nota',
        message: 'Messaggio allo studente',
        messagePlaceholder: 'Scrivi un messaggio: lo studente lo vede nel profilo web e su Telegram se collegato.',
        send: 'Invia',
        sent: 'Inviato',
        sentTelegram: 'Inviato (anche su Telegram)',
        error: 'Operazione non riuscita.',
        loading: 'Carico...',
        deleteNote: 'Elimina',
    },
    en: {
        students: 'Students',
        empty: 'No student has results in this plan yet.',
        telegram: 'Telegram linked',
        profile: 'Learner model',
        transcript: 'Conversation',
        notes: 'Notes',
        notePlaceholder: 'New note about the student...',
        visible: 'Visible to the student',
        addNote: 'Save note',
        message: 'Message to the student',
        messagePlaceholder: 'Write a message: the student sees it in the web profile and on Telegram if linked.',
        send: 'Send',
        sent: 'Sent',
        sentTelegram: 'Sent (also on Telegram)',
        error: 'Operation failed.',
        loading: 'Loading...',
        deleteNote: 'Delete',
    },
};

function ScoresLine({ scores }: { scores: Record<string, number> | null }) {
    if (!scores) return null;
    const line = Object.entries(scores)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([code, value]) => `${code}=${value}`)
        .join(' ');
    return <span className="font-mono text-xs text-slate-600">{line}</span>;
}

// base: prefisso API della dashboard (piano: /api/admin/administration-plans/<id>,
// classe: /api/admin/groups/<id>). withNotes: note+messaggi (solo classi).
export function PlanStudentsPanel({ base, withNotes = false }: { base: string; withNotes?: boolean }) {
    const { lang } = useI18n();
    const texts = TEXTS[lang as keyof typeof TEXTS] ?? TEXTS.en;
    const [students, setStudents] = useState<PlanStudent[] | null>(null);
    const [notes, setNotes] = useState<TeacherNote[]>([]);
    const [openStudent, setOpenStudent] = useState<string | null>(null);
    const [conversations, setConversations] = useState<Record<string, Array<{ role: string; text: string }>>>({});
    const [openSession, setOpenSession] = useState<string | null>(null);
    const [noteText, setNoteText] = useState('');
    const [noteVisible, setNoteVisible] = useState(false);
    const [messageText, setMessageText] = useState('');
    const [feedback, setFeedback] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const [studentsRes, notesRes] = await Promise.all([
                apiFetch(`${base}/students`),
                withNotes ? apiFetch(`${base}/notes`) : Promise.resolve(new Response('[]')),
            ]);
            if (studentsRes.ok) {
                const payload = await studentsRes.json() as { students: PlanStudent[] };
                setStudents(payload.students);
            }
            if (notesRes.ok) setNotes(await notesRes.json() as TeacherNote[]);
        } catch {
            setFeedback(texts.error);
        }
    }, [base, withNotes, texts.error]);

    useEffect(() => { void load(); }, [load]);

    const toggleSession = async (username: string, sessionId: string) => {
        if (openSession === sessionId) {
            setOpenSession(null);
            return;
        }
        setOpenSession(sessionId);
        if (!conversations[sessionId]) {
            try {
                const res = await apiFetch(
                    `${base}/students/${encodeURIComponent(username)}/conversation/${encodeURIComponent(sessionId)}`,
                );
                if (res.ok) {
                    const messages = await res.json() as Array<{ role: string; text: string }>;
                    setConversations((prev) => ({ ...prev, [sessionId]: messages }));
                }
            } catch { /* transcript non disponibile */ }
        }
    };

    const addNote = async (username: string) => {
        if (!noteText.trim()) return;
        setBusy(true);
        setFeedback('');
        try {
            const res = await apiFetch(`${base}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, text: noteText, visible_to_student: noteVisible }),
            });
            if (!res.ok) throw new Error('note failed');
            setNoteText('');
            setNoteVisible(false);
            await load();
        } catch {
            setFeedback(texts.error);
        } finally {
            setBusy(false);
        }
    };

    const deleteNote = async (noteId: number) => {
        setBusy(true);
        try {
            const res = await apiFetch(`/api/admin/teacher-notes/${noteId}`, { method: 'DELETE' });
            if (res.ok) await load();
        } finally {
            setBusy(false);
        }
    };

    const sendMessage = async (username: string) => {
        if (!messageText.trim()) return;
        setBusy(true);
        setFeedback('');
        try {
            const res = await apiFetch(`${base}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, text: messageText }),
            });
            if (!res.ok) throw new Error('message failed');
            const note = await res.json() as TeacherNote;
            setMessageText('');
            setFeedback(note.telegram_delivered ? texts.sentTelegram : texts.sent);
            await load();
        } catch {
            setFeedback(texts.error);
        } finally {
            setBusy(false);
        }
    };

    if (students === null) {
        return <p className="mt-3 text-sm text-slate-400">{texts.loading}</p>;
    }
    if (students.length === 0) {
        return <p className="mt-3 text-sm text-slate-400">{texts.empty}</p>;
    }

    return (
        <div className="mt-3 space-y-2">
            {students.map((student) => {
                const isOpen = openStudent === student.username;
                const studentNotes = notes.filter((note) => note.username === student.username);
                return (
                    <div key={student.username} className="rounded-md border border-slate-200 bg-white">
                        <button
                            type="button"
                            onClick={() => setOpenStudent(isOpen ? null : student.username)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-slate-700"
                        >
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <span className="font-mono">{student.username}</span>
                            <span className="text-xs font-normal text-slate-400">
                                {student.results.length} {student.results.length === 1 ? 'test' : 'test'}
                                {student.telegram_linked ? ` - ${texts.telegram}` : ''}
                            </span>
                        </button>
                        {isOpen && (
                            <div className="space-y-4 border-t border-slate-100 px-3 py-3">
                                <ul className="space-y-2">
                                    {student.results.map((result) => (
                                        <li key={result.id} className="text-sm text-slate-700">
                                            <button
                                                type="button"
                                                onClick={() => void toggleSession(student.username, result.session_id)}
                                                className="inline-flex items-center gap-1 font-semibold text-indigo-700 hover:underline"
                                            >
                                                <MessageSquare className="h-3.5 w-3.5" />
                                                {result.questionnaire_type}
                                            </button>
                                            {result.submitted_at && (
                                                <span className="ml-2 text-xs text-slate-400">
                                                    {new Date(result.submitted_at).toLocaleDateString()}
                                                </span>
                                            )}
                                            <div><ScoresLine scores={result.scores} /></div>
                                            {openSession === result.session_id && (
                                                <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-slate-50 p-2">
                                                    <p className="text-xs font-semibold uppercase text-slate-400">{texts.transcript}</p>
                                                    {(conversations[result.session_id] || []).map((message, index) => (
                                                        <p key={index} className="text-xs text-slate-600">
                                                            <span className="font-semibold">{message.role === 'student' ? 'Studente' : 'AI'}:</span>{' '}
                                                            {message.text}
                                                        </p>
                                                    ))}
                                                </div>
                                            )}
                                        </li>
                                    ))}
                                </ul>

                                {student.learner_profile && (
                                    <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                                        <p className="text-xs font-semibold uppercase text-slate-400">{texts.profile}</p>
                                        <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-slate-600">
                                            {JSON.stringify(student.learner_profile, null, 1)}
                                        </pre>
                                    </div>
                                )}

                                {withNotes && (
                                <div>
                                    <p className="flex items-center gap-1 text-xs font-semibold uppercase text-slate-400">
                                        <StickyNote className="h-3.5 w-3.5" /> {texts.notes}
                                    </p>
                                    <ul className="mt-1 space-y-1">
                                        {studentNotes.map((note) => (
                                            <li key={note.id} className="flex items-start gap-2 text-sm text-slate-700">
                                                <span className="flex-1">
                                                    {note.kind === 'message' ? '[messaggio] ' : ''}{note.text}
                                                    <span className="ml-2 text-xs text-slate-400">
                                                        {note.author_username}
                                                        {note.visible_to_student ? ` - ${texts.visible.toLowerCase()}` : ''}
                                                        {note.created_at ? ` - ${new Date(note.created_at).toLocaleDateString()}` : ''}
                                                    </span>
                                                </span>
                                                <button
                                                    type="button"
                                                    title={texts.deleteNote}
                                                    onClick={() => void deleteNote(note.id)}
                                                    className="text-slate-400 hover:text-red-600"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                    <div className="mt-2 space-y-1">
                                        <textarea
                                            value={noteText}
                                            onChange={(event) => setNoteText(event.target.value)}
                                            placeholder={texts.notePlaceholder}
                                            rows={2}
                                            className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                                        />
                                        <div className="flex items-center justify-between">
                                            <label className="flex items-center gap-1 text-xs text-slate-500">
                                                <input
                                                    type="checkbox"
                                                    checked={noteVisible}
                                                    onChange={(event) => setNoteVisible(event.target.checked)}
                                                />
                                                {texts.visible}
                                            </label>
                                            <button
                                                type="button"
                                                disabled={busy || !noteText.trim()}
                                                onClick={() => void addNote(student.username)}
                                                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                            >
                                                {texts.addNote}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                )}

                                {withNotes && (
                                <div>
                                    <p className="flex items-center gap-1 text-xs font-semibold uppercase text-slate-400">
                                        <Send className="h-3.5 w-3.5" /> {texts.message}
                                    </p>
                                    <textarea
                                        value={messageText}
                                        onChange={(event) => setMessageText(event.target.value)}
                                        placeholder={texts.messagePlaceholder}
                                        rows={2}
                                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                                    />
                                    <div className="mt-1 flex items-center justify-between">
                                        <span className="text-xs text-slate-500">{feedback}</span>
                                        <button
                                            type="button"
                                            disabled={busy || !messageText.trim()}
                                            onClick={() => void sendMessage(student.username)}
                                            className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                                        >
                                            {texts.send}
                                        </button>
                                    </div>
                                </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
            <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
            >
                <RefreshCw className="h-3 w-3" /> {texts.students}
            </button>
        </div>
    );
}
