'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { apiFetch } from '@/lib/auth';
import { Check, ChevronDown, ChevronRight, Grid3X3, List, RefreshCw, Send, StickyNote, Trash2 } from 'lucide-react';

import { StudentResultItem, type StudentResult } from '@/components/teacher/StudentResultItem';
import { buildClassResultsMatrix, formatCompactScores, type PlanStudent } from '@/lib/class-results-matrix';
import { resolveClassPathToolName } from '@/lib/class-paths-tool-names';
import { Button } from '@/components/ui/Button';

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

// Local copy is complete for every supported interface language.
const TEXTS = {
    it: {
        students: "Partecipanti",
        empty: 'Nessun partecipante ha ancora risultati in questo piano.',
        noStudents: 'Nessun partecipante iscritto a questa classe.',
        telegram: 'Telegram collegato',
        profile: 'Taccuino del partecipante (modello del discente)',
        transcript: 'Conversazione',
        notes: 'Note',
        notePlaceholder: 'Nuova nota sul partecipante...',
        visible: 'Visibile al partecipante',
        addNote: 'Salva nota',
        message: 'Messaggio al partecipante',
        messagePlaceholder: 'Scrivi un messaggio: il partecipante lo vede nella sua area studente web e su Telegram se collegato.',
        send: 'Invia',
        sent: 'Inviato',
        sentTelegram: 'Inviato (anche su Telegram)',
        error: 'Operazione non riuscita.',
        loading: 'Carico...',
        deleteNote: 'Elimina',
        tests: 'test',
        studentRole: 'Partecipante',
        matrixView: "Vista d'insieme",
        listView: 'Elenco partecipanti',
        viewModeLabel: 'Modalità di visualizzazione',
        noResultsYet: 'Nessun partecipante ha ancora completato questionari o strumenti.',
        studentHeader: 'Partecipante',
        totalCompleted: 'Completati',
        selectCellHint: 'Seleziona una casella compilata per visualizzare i punteggi completi e leggere la conversazione.',
        closeDetails: 'Chiudi dettaglio',
        openStudentSheet: 'Apri scheda completa',
        refresh: 'Aggiorna',
    },
    en: {
        students: "Participants",
        empty: 'No participant has results in this plan yet.',
        noStudents: 'No participants enrolled in this class.',
        telegram: 'Telegram linked',
        profile: 'Participant notebook (learner model)',
        transcript: 'Conversation',
        notes: 'Notes',
        notePlaceholder: 'New note about the participant...',
        visible: 'Visible to the participant',
        addNote: 'Save note',
        message: 'Message to the participant',
        messagePlaceholder: 'Write a message: the participant sees it in their student area on the web and on Telegram if linked.',
        send: 'Send',
        sent: 'Sent',
        sentTelegram: 'Sent (also on Telegram)',
        error: 'Operation failed.',
        loading: 'Loading...',
        deleteNote: 'Delete',
        tests: 'tests',
        studentRole: 'Participant',
        matrixView: 'Overview matrix',
        listView: 'Participants list',
        viewModeLabel: 'View mode',
        noResultsYet: 'No participant has completed questionnaires or tools yet.',
        studentHeader: 'Participant',
        totalCompleted: 'Completed',
        selectCellHint: 'Select a completed cell to view full scores and read the conversation.',
        closeDetails: 'Close details',
        openStudentSheet: 'Open full profile',
        refresh: 'Refresh',
    },
    es: {
        students: "Participantes",
        empty: 'Ningún participante tiene aún resultados en este plan.',
        noStudents: 'No hay participantes inscritos en esta clase.',
        telegram: 'Telegram vinculado',
        profile: 'Cuaderno del participante (modelo del alumno)',
        transcript: 'Conversación',
        notes: 'Notas',
        notePlaceholder: 'Nueva nota sobre el participante...',
        visible: 'Visible para el participante',
        addNote: 'Guardar nota',
        message: 'Mensaje al participante',
        messagePlaceholder: 'Escribe un mensaje: el participante lo verá en su área del estudiante web y en Telegram si está vinculado.',
        send: 'Enviar',
        sent: 'Enviado',
        sentTelegram: 'Enviado (también por Telegram)',
        error: 'La operación ha fallado.',
        loading: 'Cargando...',
        deleteNote: 'Eliminar',
        tests: 'pruebas',
        studentRole: 'Participante',
        matrixView: 'Vista general',
        listView: 'Lista de participantes',
        viewModeLabel: 'Modo de visualización',
        noResultsYet: 'Ningún participante ha completado cuestionarios o herramientas aún.',
        studentHeader: 'Participante',
        totalCompleted: 'Completados',
        selectCellHint: 'Selecciona una casilla completada para ver las puntuaciones completas y leer la conversación.',
        closeDetails: 'Cerrar detalles',
        openStudentSheet: 'Abrir ficha completa',
        refresh: 'Actualizar',
    },
    fr: {
        students: "Participants",
        empty: 'Aucun participant n’a encore de résultats dans ce plan.',
        noStudents: 'Aucun participant inscrit dans cette classe.',
        telegram: 'Telegram associé',
        profile: 'Carnet du participant (modèle de l’apprenant)',
        transcript: 'Conversation',
        notes: 'Notes',
        notePlaceholder: 'Nouvelle note sur le participant...',
        visible: 'Visible par le participant',
        addNote: 'Enregistrer la note',
        message: 'Message au participant',
        messagePlaceholder: 'Écrivez un message : le participant le verra dans son espace élève web et sur Telegram s’il est associé.',
        send: 'Envoyer',
        sent: 'Envoyé',
        sentTelegram: 'Envoyé (également sur Telegram)',
        error: 'L’opération a échoué.',
        loading: 'Chargement...',
        deleteNote: 'Supprimer',
        tests: 'tests',
        studentRole: 'Participant',
        matrixView: 'Vue d’ensemble',
        listView: 'Liste des participants',
        viewModeLabel: 'Mode d’affichage',
        noResultsYet: 'Aucun participant n’a encore rempli de questionnaire ou d’outil.',
        studentHeader: 'Participant',
        totalCompleted: 'Terminés',
        selectCellHint: 'Sélectionnez une case remplie pour afficher les scores complets et lire la conversation.',
        closeDetails: 'Fermer les détails',
        openStudentSheet: 'Ouvrir la fiche complète',
        refresh: 'Actualiser',
    },
    de: {
        students: "Teilnehmende",
        empty: 'Für diesen Plan liegen noch keine Ergebnisse von Teilnehmenden vor.',
        noStudents: 'In dieser Klasse sind keine Teilnehmenden eingeschrieben.',
        telegram: 'Telegram verknüpft',
        profile: 'Notizbuch der teilnehmenden Person (Lernendenmodell)',
        transcript: 'Unterhaltung',
        notes: 'Notizen',
        notePlaceholder: 'Neue Notiz zur teilnehmenden Person...',
        visible: 'Für die teilnehmende Person sichtbar',
        addNote: 'Notiz speichern',
        message: 'Nachricht an die teilnehmende Person',
        messagePlaceholder: 'Schreiben Sie eine Nachricht: Sie wird im persönlichen Webbereich und bei Verknüpfung auch auf Telegram angezeigt.',
        send: 'Senden',
        sent: 'Gesendet',
        sentTelegram: 'Gesendet (auch über Telegram)',
        error: 'Der Vorgang ist fehlgeschlagen.',
        loading: 'Wird geladen...',
        deleteNote: 'Löschen',
        tests: 'Tests',
        studentRole: 'Teilnehmende Person',
        matrixView: 'Übersichtsmatrix',
        listView: 'Liste der Teilnehmenden',
        viewModeLabel: 'Ansichtsmodus',
        noResultsYet: 'Bisher hat noch keine teilnehmende Person Fragebögen oder Werkzeuge ausgefüllt.',
        studentHeader: 'Teilnehmende Person',
        totalCompleted: 'Abgeschlossen',
        selectCellHint: 'Wählen Sie ein ausgefülltes Feld, um die vollständigen Ergebnisse zu sehen und die Unterhaltung zu lesen.',
        closeDetails: 'Details schließen',
        openStudentSheet: 'Vollständiges Profil öffnen',
        refresh: 'Aktualisieren',
    },
    sv: {
        students: "Deltagare",
        empty: 'Ingen deltagare har ännu resultat i den här planen.',
        noStudents: 'Inga deltagare är inskrivna i den här klassen.',
        telegram: 'Telegram länkat',
        profile: 'Deltagarens anteckningsbok (lärandemodell)',
        transcript: 'Samtal',
        notes: 'Anteckningar',
        notePlaceholder: 'Ny anteckning om deltagaren...',
        visible: 'Synlig för deltagaren',
        addNote: 'Spara anteckning',
        message: 'Meddelande till deltagaren',
        messagePlaceholder: 'Skriv ett meddelande: deltagaren ser det i sin personliga webbvy och på Telegram om kontot är länkat.',
        send: 'Skicka',
        sent: 'Skickat',
        sentTelegram: 'Skickat (även via Telegram)',
        error: 'Åtgärden misslyckades.',
        loading: 'Laddar...',
        deleteNote: 'Ta bort',
        tests: 'test',
        studentRole: 'Deltagare',
        matrixView: 'Översiktsmatris',
        listView: 'Deltagarlista',
        viewModeLabel: 'Visningsläge',
        noResultsYet: 'Ingen deltagare har ännu slutfört frågeformulär eller verktyg.',
        studentHeader: 'Deltagare',
        totalCompleted: 'Slutförda',
        selectCellHint: 'Välj en ifylld ruta för att visa fullständiga poäng och läsa samtalet.',
        closeDetails: 'Stäng detaljer',
        openStudentSheet: 'Öppna hela profilen',
        refresh: 'Uppdatera',
    },
};

// base: prefisso API della dashboard (piano: /api/admin/administration-plans/<id>,
// classe: /api/admin/groups/<id>). withNotes: note+messaggi (solo classi).
export function PlanStudentsPanel({ base, withNotes = false }: { base: string; withNotes?: boolean }) {
    const { lang } = useI18n();
    const texts = TEXTS[lang as keyof typeof TEXTS] ?? TEXTS.en;
    const [students, setStudents] = useState<PlanStudent[] | null>(null);
    const [notes, setNotes] = useState<TeacherNote[]>([]);
    const [viewMode, setViewMode] = useState<'matrix' | 'list'>('matrix');
    const [openStudent, setOpenStudent] = useState<string | null>(null);
    const [selectedCell, setSelectedCell] = useState<{ username: string; result: StudentResult } | null>(null);
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
        return <p className="mt-4 text-sm text-ink-muted">{texts.loading}</p>;
    }
    if (students.length === 0) {
        return <p className="mt-4 text-sm text-ink-muted">{texts.empty}</p>;
    }

    const matrix = buildClassResultsMatrix(students);
    const totalSubmissions = Object.values(matrix.totalsByInstrument).reduce((a, b) => a + b, 0);

    return (
        <div className="mt-4 space-y-4" data-class-results-panel>
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
                <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-ink">{texts.students}</h3>
                    <span className="rounded-full bg-surface-raised px-2 py-1 text-xs font-semibold text-ink-body">
                        {students.length}
                    </span>
                </div>
                <div role="group" aria-label={texts.viewModeLabel} className="inline-flex rounded-lg border border-line bg-surface-raised p-1">
                    <button
                        type="button"
                        aria-pressed={viewMode === 'matrix'}
                        onClick={() => setViewMode('matrix')}
                        className={`inline-flex min-h-control items-center gap-2 rounded-control px-4 text-xs font-semibold transition-colors ${
                            viewMode === 'matrix' ? 'bg-surface text-link shadow-card' : 'text-ink-muted hover:text-ink'
                        }`}
                    >
                        <Grid3X3 className="h-3.5 w-3.5" aria-hidden />
                        {texts.matrixView}
                    </button>
                    <button
                        type="button"
                        aria-pressed={viewMode === 'list'}
                        onClick={() => setViewMode('list')}
                        className={`inline-flex min-h-control items-center gap-2 rounded-control px-4 text-xs font-semibold transition-colors ${
                            viewMode === 'list' ? 'bg-surface text-link shadow-card' : 'text-ink-muted hover:text-ink'
                        }`}
                    >
                        <List className="h-3.5 w-3.5" aria-hidden />
                        {texts.listView}
                    </button>
                </div>
            </div>

            {viewMode === 'matrix' ? (
                matrix.instruments.length === 0 ? (
                    <div className="rounded-lg border border-line bg-surface p-4 text-center">
                        <p className="text-sm text-ink-muted">{texts.noResultsYet}</p>
                        <Button variant="secondary"
                            type="button"
                            onClick={() => setViewMode('list')}
                            className="mt-4"
                        >
                            <List className="h-4 w-4" aria-hidden />
                            {texts.listView} ({students.length})
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-card">
                            <table className="w-full border-collapse text-left text-sm" aria-label={texts.matrixView}>
                                <thead>
                                    <tr className="border-b border-line bg-surface-sunken/75">
                                        <th scope="col" className="whitespace-nowrap px-4 py-2 font-semibold text-ink">
                                            {texts.studentHeader}
                                        </th>
                                        {matrix.instruments.map(inst => (
                                            <th
                                                key={inst}
                                                scope="col"
                                                title={resolveClassPathToolName(inst, lang)}
                                                className="whitespace-nowrap px-4 py-2 text-center font-semibold text-ink"
                                            >
                                                <span className="font-mono text-xs">{inst}</span>
                                                <span className="block text-2xs font-normal text-ink-muted">
                                                    {matrix.totalsByInstrument[inst]}/{matrix.totalStudents}
                                                </span>
                                            </th>
                                        ))}
                                        <th scope="col" className="whitespace-nowrap px-4 py-2 text-center font-semibold text-ink">
                                            {texts.totalCompleted}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-line">
                                    {matrix.rows.map(row => (
                                        <tr key={row.username} className="hover:bg-surface-sunken/60">
                                            <th scope="row" className="whitespace-nowrap px-4 py-2 font-mono text-xs font-semibold text-ink">
                                                <div className="flex items-center gap-2">
                                                    <span>{row.username}</span>
                                                    {row.telegram_linked && (
                                                        <span title={texts.telegram} className="inline-flex items-center rounded bg-info-soft px-1 py-1 text-2xs font-semibold text-info-ink">
                                                            {'TG'}
                                                        </span>
                                                    )}
                                                </div>
                                            </th>
                                            {matrix.instruments.map(inst => {
                                                const cell = row.cells[inst];
                                                if (!cell || !cell.latest) {
                                                    return (
                                                        <td key={inst} className="px-2 py-2 text-center font-mono text-sm text-ink-muted">
                                                            —
                                                        </td>
                                                    );
                                                }
                                                const isSelected = selectedCell?.username === row.username && selectedCell?.result.id === cell.latest.id;
                                                return (
                                                    <td key={inst} className="px-2 py-2 text-center">
                                                        <button
                                                            type="button"
                                                            aria-pressed={isSelected}
                                                            aria-label={`${row.username} — ${inst}: ${cell.latest.submitted_at ? new Date(cell.latest.submitted_at).toLocaleDateString(lang) : ''}`}
                                                            onClick={() => setSelectedCell(isSelected ? null : { username: row.username, result: cell.latest! })}
                                                            className={`flex min-h-control w-full min-w-[7rem] flex-col items-center justify-center rounded-control border p-1 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus ${
                                                                isSelected
                                                                    ? 'border-brand bg-brand-soft text-link ring-2 ring-brand'
                                                                    : 'border-success-line bg-success-soft/60 text-success-ink hover:border-success hover:bg-success-soft'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-1 font-semibold text-success-ink">
                                                                <Check className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden />
                                                                <span>{cell.latest.submitted_at ? new Date(cell.latest.submitted_at).toLocaleDateString(lang) : ''}</span>
                                                                {cell.results.length > 1 && (
                                                                    <span className="rounded bg-success-line px-1 text-2xs font-semibold text-success-ink" title={`${cell.results.length} ${texts.tests}`}>
                                                                        {`×${cell.results.length}`}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {cell.latest.scores && (
                                                                <div className="mt-1 max-w-[9rem] truncate font-mono text-2xs text-ink-muted">
                                                                    {formatCompactScores(cell.latest.scores)}
                                                                </div>
                                                            )}
                                                        </button>
                                                    </td>
                                                );
                                            })}
                                            <td className="whitespace-nowrap px-4 py-2 text-center font-mono text-xs font-semibold text-ink-body">
                                                {row.totalCompleted}/{matrix.instruments.length}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="border-t border-line bg-surface-sunken/75">
                                    <tr>
                                        <th scope="row" className="whitespace-nowrap px-4 py-2 text-xs font-semibold text-ink-body">
                                            {texts.totalCompleted}
                                        </th>
                                        {matrix.instruments.map(inst => (
                                            <td key={inst} className="px-2 py-2 text-center font-mono text-xs font-semibold text-ink-body">
                                                {matrix.totalsByInstrument[inst]}/{matrix.totalStudents}
                                            </td>
                                        ))}
                                        <td className="px-4 py-2 text-center font-mono text-xs font-semibold text-ink">
                                            {totalSubmissions}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        {selectedCell ? (
                            <div className="space-y-4 rounded-card border border-brand-line bg-brand-soft/40 p-4" aria-live="polite">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-line pb-2">
                                    <div>
                                        <h4 className="font-semibold text-ink">
                                            <span className="font-mono text-link">{selectedCell.username}</span>
                                            {' · '}
                                            <span>{resolveClassPathToolName(selectedCell.result.questionnaire_type, lang)}</span>
                                        </h4>
                                        <p className="text-xs text-ink-muted">
                                            {selectedCell.result.submitted_at && new Date(selectedCell.result.submitted_at).toLocaleString(lang)}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setViewMode('list');
                                                setOpenStudent(selectedCell.username);
                                            }}
                                            className="inline-flex min-h-control items-center gap-1 rounded-control border border-line-strong bg-surface px-2 py-1 text-xs font-semibold text-ink-body hover:bg-surface-sunken"
                                        >
                                            {texts.openStudentSheet}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedCell(null)}
                                            className="inline-flex min-h-control items-center rounded-control border border-line-strong bg-surface px-2 py-1 text-xs font-semibold text-ink-body hover:bg-surface-sunken"
                                        >
                                            {texts.closeDetails}
                                        </button>
                                    </div>
                                </div>
                                <div className="rounded-lg border border-line bg-surface p-4">
                                    <StudentResultItem base={base} username={selectedCell.username} result={selectedCell.result} />
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-ink-muted">{texts.selectCellHint}</p>
                        )}
                    </div>
                )
            ) : (
                <div className="space-y-2">
                    {students.map((student) => {
                        const isOpen = openStudent === student.username;
                        const studentNotes = notes.filter((note) => note.username === student.username);
                        return (
                            <div key={student.username} className="rounded-control border border-line bg-surface">
                                <button
                                    type="button"
                                    onClick={() => setOpenStudent(isOpen ? null : student.username)}
                                    className="min-h-control flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-semibold text-ink-body"
                                >
                                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                    <span className="font-mono">{student.username}</span>
                                    <span className="text-xs font-normal text-ink-muted">
                                        {student.results.length} {texts.tests}
                                        {student.telegram_linked ? ` - ${texts.telegram}` : ''}
                                    </span>
                                </button>
                                {isOpen && (
                                    <div className="space-y-4 border-t border-line px-4 py-4">
                                        {student.results.length > 0 ? (
                                            <ul className="space-y-2">
                                                {student.results.map((result) => (
                                                    <li key={result.id}>
                                                        <StudentResultItem base={base} username={student.username} result={result} />
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-xs text-ink-muted">{texts.noResultsYet}</p>
                                        )}

                                        {student.learner_profile && (
                                            <div className="rounded-control border border-line bg-surface-sunken p-2">
                                                <p className="text-xs font-semibold text-ink-muted">{texts.profile}</p>
                                                <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-ink-muted">
                                                    {JSON.stringify(student.learner_profile, null, 1)}
                                                </pre>
                                            </div>
                                        )}

                                        {withNotes && (
                                        <div>
                                            <p className="flex items-center gap-1 text-xs font-semibold text-ink-muted">
                                                <StickyNote className="h-3.5 w-3.5" /> {texts.notes}
                                            </p>
                                            <ul className="mt-1 space-y-1">
                                                {studentNotes.map((note) => (
                                                    <li key={note.id} className="flex items-start gap-2 text-sm text-ink-body">
                                                        <span className="flex-1">
                                                            {note.kind === 'message' ? '[messaggio] ' : ''}{note.text}
                                                            <span className="ml-2 text-xs text-ink-muted">
                                                                {note.author_username}
                                                                {note.visible_to_student ? ` - ${texts.visible.toLowerCase()}` : ''}
                                                                {note.created_at ? ` - ${new Date(note.created_at).toLocaleDateString()}` : ''}
                                                            </span>
                                                        </span>
                                                        <button
                                                            type="button"
                                                            title={texts.deleteNote}
                                                            onClick={() => void deleteNote(note.id)}
                                                            className="min-h-control text-ink-muted hover:text-danger"
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
                                                    className="w-full rounded-control border border-line-strong px-2 py-1 text-sm"
                                                />
                                                <div className="flex items-center justify-between">
                                                    <label className="flex items-center gap-1 text-xs text-ink-muted">
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
                                                        className="min-h-control rounded-control border border-line-strong px-2 py-1 text-xs font-semibold text-ink-body hover:bg-surface-sunken disabled:opacity-50"
                                                    >
                                                        {texts.addNote}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                        )}

                                        {withNotes && (
                                        <div>
                                            <p className="flex items-center gap-1 text-xs font-semibold text-ink-muted">
                                                <Send className="h-3.5 w-3.5" /> {texts.message}
                                            </p>
                                            <textarea
                                                value={messageText}
                                                onChange={(event) => setMessageText(event.target.value)}
                                                placeholder={texts.messagePlaceholder}
                                                rows={2}
                                                className="mt-1 w-full rounded-control border border-line-strong px-2 py-1 text-sm"
                                            />
                                            <div className="mt-1 flex items-center justify-between">
                                                <span className="text-xs text-ink-muted">{feedback}</span>
                                                <Button
                                                    type="button"
                                                    disabled={busy || !messageText.trim()}
                                                    onClick={() => void sendMessage(student.username)}
                                                >
                                                    {texts.send}
                                                </Button>
                                            </div>
                                        </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <button
                type="button"
                onClick={() => void load()}
                className="inline-flex min-h-control items-center gap-1 text-xs text-ink-muted hover:text-ink"
            >
                <RefreshCw className="h-3.5 w-3.5" /> {texts.refresh}
            </button>
        </div>
    );
}
