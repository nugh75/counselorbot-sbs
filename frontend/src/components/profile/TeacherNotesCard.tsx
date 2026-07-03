'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { GraduationCap } from 'lucide-react';

interface TeacherNote {
    id: number;
    author_username: string;
    kind: string;
    text: string;
    created_at: string | null;
}

// ponytail: testi inline it/en come TelegramLinkCard.
const TEXTS = {
    it: { title: 'Dal docente', empty: '' },
    en: { title: 'From your teacher', empty: '' },
};

export function TeacherNotesCard({ lang }: { lang: string }) {
    const texts = TEXTS[lang as keyof typeof TEXTS] ?? TEXTS.en;
    const [notes, setNotes] = useState<TeacherNote[]>([]);

    useEffect(() => {
        apiFetch('/api/user/teacher-notes')
            .then((res) => (res.ok ? res.json() : []))
            .then((payload) => setNotes(Array.isArray(payload) ? payload as TeacherNote[] : []))
            .catch(() => { /* nessuna nota: card nascosta */ });
    }, []);

    if (notes.length === 0) return null;

    return (
        <section className="glass-panel space-y-3 p-5" aria-labelledby="teacher-notes-section">
            <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-slate-500" aria-hidden />
                <h2 id="teacher-notes-section" className="text-lg font-bold text-slate-800">{texts.title}</h2>
            </div>
            <ul className="space-y-2">
                {notes.map((note) => (
                    <li key={note.id} className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700">
                        {note.kind === 'message' ? '📩 ' : ''}{note.text}
                        <div className="mt-1 text-xs text-slate-400">
                            {note.author_username}
                            {note.created_at ? ` · ${new Date(note.created_at).toLocaleDateString()}` : ''}
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
}
