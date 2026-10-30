'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { GraduationCap } from 'lucide-react';
import { useUserAccess } from '@/lib/use-user-access';
import { isClassContentHidden } from '@/lib/user-access';
import { Card } from '@/components/ui/Card';

interface TeacherNote {
    id: number;
    author_username: string;
    kind: string;
    text: string;
    created_at: string | null;
}

// Local copy is complete for every supported interface language.
const TEXTS = {
    it: { title: 'Suggerimenti del docente/ricercatore', message: 'messaggio' },
    en: { title: 'Suggestions from your teacher/researcher', message: 'message' },
    es: { title: 'Sugerencias de tu docente o investigador', message: 'mensaje' },
    fr: { title: 'Suggestions de votre enseignant ou chercheur', message: 'message' },
    de: { title: 'Hinweise Ihrer Lehrkraft oder Forschungsperson', message: 'Nachricht' },
    sv: { title: 'Förslag från din lärare eller forskare', message: 'meddelande' },
};

export function TeacherNotesCard({ lang }: { lang: string }) {
    const { access } = useUserAccess();
    const texts = TEXTS[lang as keyof typeof TEXTS] ?? TEXTS.en;
    const [notes, setNotes] = useState<TeacherNote[]>([]);

    useEffect(() => {
        apiFetch('/api/user/teacher-notes')
            .then((res) => (res.ok ? res.json() : []))
            .then((payload) => setNotes(Array.isArray(payload) ? payload as TeacherNote[] : []))
            .catch(() => { /* nessuna nota: card nascosta */ });
    }, []);

    if (isClassContentHidden(access) || notes.length === 0) return null;

    return (
        <Card as="section" className="space-y-4 p-6" aria-labelledby="teacher-notes-section">
            <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4 text-ink-muted" aria-hidden />
                <h2 id="teacher-notes-section" className="text-lg font-semibold text-ink">{texts.title}</h2>
            </div>
            <ul className="space-y-2">
                {notes.map((note) => (
                    <li key={note.id} className="rounded-control border border-line bg-surface p-4 text-sm text-ink-body">
                        {note.kind === 'message' ? `[${texts.message}] ` : ''}{note.text}
                        <div className="mt-1 text-xs text-ink-muted">
                            {note.author_username}
                            {note.created_at ? ` - ${new Date(note.created_at).toLocaleDateString(lang)}` : ''}
                        </div>
                    </li>
                ))}
            </ul>
        </Card>
    );
}
