'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { apiFetch } from '@/lib/auth';
import { Check, ChevronDown, ChevronRight, Grid3X3, List, RefreshCw, Send, StickyNote, Trash2 } from 'lucide-react';

import { StudentResultItem, type StudentResult } from '@/components/teacher/StudentResultItem';
import { buildClassResultsMatrix, formatCompactScores, type PlanStudent } from '@/lib/class-results-matrix';
import { resolveClassPathToolName } from '@/lib/class-paths-tool-names';

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
        return <p className="mt-3 text-sm text-slate-500">{texts.loading}</p>;
    }
    if (students.length === 0) {
        return <p className="mt-3 text-sm text-slate-500">{texts.empty}</p>;
    }

    const matrix = buildClassResultsMatrix(students);
    const totalSubmissions = Object.values(matrix.totalsByInstrument).reduce((a, b) => a + b, 0);

    return (
        <div className="mt-3 space-y-4" data-class-results-panel>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-800">{texts.students}</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {students.length}
                    </span>
                </div>
                <div role="group" aria-label={texts.viewModeLabel} className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1">
                    <button
                        type="button"
                        aria-pressed={viewMode === 'matrix'}
                        onClick={() => setViewMode('matrix')}
                        className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors ${
                            viewMode === 'matrix' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <Grid3X3 className="h-3.5 w-3.5" aria-hidden />
                        {texts.matrixView}
                    </button>
                    <button
                        type="button"
                        aria-pressed={viewMode === 'list'}
                        onClick={() => setViewMode('list')}
                        className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors ${
                            viewMode === 'list' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <List className="h-3.5 w-3.5" aria-hidden />
                        {texts.listView}
                    </button>
                </div>
            </div>

            {viewMode === 'matrix' ? (
                matrix.instruments.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-white p-4 text-center">
                        <p className="text-sm text-slate-600">{texts.noResultsYet}</p>
                        <button
                            type="button"
                            onClick={() => setViewMode('list')}
                            className="mt-3 inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            <List className="h-4 w-4" aria-hidden />
                            {texts.listView} ({students.length})
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                            <table className="w-full border-collapse text-left text-sm" aria-label={texts.matrixView}>
                                <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50/75">
                                        <th scope="col" className="whitespace-nowrap px-3 py-2.5 font-semibold text-slate-800">
                                            {texts.studentHeader}
                                        </th>
                                        {matrix.instruments.map(inst => (
                                            <th
                                                key={inst}
                                                scope="col"
                                                title={resolveClassPathToolName(inst, lang)}
                                                className="whitespace-nowrap px-3 py-2.5 text-center font-semibold text-slate-800"
                                            >
                                                <span className="font-mono text-xs">{inst}</span>
                                                <span className="block text-2xs font-normal text-slate-500">
                                                    {matrix.totalsByInstrument[inst]}/{matrix.totalStudents}
                                                </span>
                                            </th>
                                        ))}
                                        <th scope="col" className="whitespace-nowrap px-3 py-2.5 text-center font-semibold text-slate-800">
                                            {texts.totalCompleted}
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {matrix.rows.map(row => (
                                        <tr key={row.username} className="hover:bg-slate-50/60">
                                            <th scope="row" className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-medium text-slate-900">
                                                <div className="flex items-center gap-1.5">
                                                    <span>{row.username}</span>
                                                    {row.telegram_linked && (
                                                        <span title={texts.telegram} className="inline-flex items-center rounded bg-sky-100 px-1 py-0.5 text-2xs font-semibold text-sky-800">
                                                            {'TG'}
                                                        </span>
                                                    )}
                                                </div>
                                            </th>
                                            {matrix.instruments.map(inst => {
                                                const cell = row.cells[inst];
                                                if (!cell || !cell.latest) {
                                                    return (
                                                        <td key={inst} className="px-2 py-2 text-center font-mono text-sm text-slate-400">
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
                                                            className={`flex min-h-[44px] w-full min-w-[7rem] flex-col items-center justify-center rounded-md border p-1 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 ${
                                                                isSelected
                                                                    ? 'border-indigo-600 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-600'
                                                                    : 'border-emerald-200 bg-emerald-50/60 text-emerald-950 hover:border-emerald-400 hover:bg-emerald-50'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-1 font-semibold text-emerald-800">
                                                                <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                                                                <span>{cell.latest.submitted_at ? new Date(cell.latest.submitted_at).toLocaleDateString(lang) : ''}</span>
                                                                {cell.results.length > 1 && (
                                                                    <span className="rounded bg-emerald-200 px-1 text-2xs font-bold text-emerald-900" title={`${cell.results.length} ${texts.tests}`}>
                                                                        {`×${cell.results.length}`}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {cell.latest.scores && (
                                                                <div className="mt-0.5 max-w-[9rem] truncate font-mono text-2xs text-slate-600">
                                                                    {formatCompactScores(cell.latest.scores)}
                                                                </div>
                                                            )}
                                                        </button>
                                                    </td>
                                                );
                                            })}
                                            <td className="whitespace-nowrap px-3 py-2 text-center font-mono text-xs font-medium text-slate-700">
                                                {row.totalCompleted}/{matrix.instruments.length}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="border-t border-slate-200 bg-slate-50/75">
                                    <tr>
                                        <th scope="row" className="whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-slate-700">
                                            {texts.totalCompleted}
                                        </th>
                                        {matrix.instruments.map(inst => (
                                            <td key={inst} className="px-2 py-2 text-center font-mono text-xs font-semibold text-slate-700">
                                                {matrix.totalsByInstrument[inst]}/{matrix.totalStudents}
                                            </td>
                                        ))}
                                        <td className="px-3 py-2 text-center font-mono text-xs font-bold text-slate-800">
                                            {totalSubmissions}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>

                        {selectedCell ? (
                            <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4" aria-live="polite">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-2">
                                    <div>
                                        <h4 className="font-bold text-slate-900">
                                            <span className="font-mono text-indigo-700">{selectedCell.username}</span>
                                            {' · '}
                                            <span>{resolveClassPathToolName(selectedCell.result.questionnaire_type, lang)}</span>
                                        </h4>
                                        <p className="text-xs text-slate-600">
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
                                            className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                        >
                                            {texts.openStudentSheet}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedCell(null)}
                                            className="inline-flex min-h-[36px] items-center rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                        >
                                            {texts.closeDetails}
                                        </button>
                                    </div>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-white p-3">
                                    <StudentResultItem base={base} username={selectedCell.username} result={selectedCell.result} />
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-slate-500">{texts.selectCellHint}</p>
                        )}
                    </div>
                )
            ) : (
                <div className="space-y-2">
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
                                    <span className="text-xs font-normal text-slate-500">
                                        {student.results.length} {texts.tests}
                                        {student.telegram_linked ? ` - ${texts.telegram}` : ''}
                                    </span>
                                </button>
                                {isOpen && (
                                    <div className="space-y-4 border-t border-slate-100 px-3 py-3">
                                        {student.results.length > 0 ? (
                                            <ul className="space-y-2">
                                                {student.results.map((result) => (
                                                    <li key={result.id}>
                                                        <StudentResultItem base={base} username={student.username} result={result} />
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : (
                                            <p className="text-xs text-slate-500">{texts.noResultsYet}</p>
                                        )}

                                        {student.learner_profile && (
                                            <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                                                <p className="text-xs font-semibold uppercase text-slate-500">{texts.profile}</p>
                                                <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-slate-600">
                                                    {JSON.stringify(student.learner_profile, null, 1)}
                                                </pre>
                                            </div>
                                        )}

                                        {withNotes && (
                                        <div>
                                            <p className="flex items-center gap-1 text-xs font-semibold uppercase text-slate-500">
                                                <StickyNote className="h-3.5 w-3.5" /> {texts.notes}
                                            </p>
                                            <ul className="mt-1 space-y-1">
                                                {studentNotes.map((note) => (
                                                    <li key={note.id} className="flex items-start gap-2 text-sm text-slate-700">
                                                        <span className="flex-1">
                                                            {note.kind === 'message' ? '[messaggio] ' : ''}{note.text}
                                                            <span className="ml-2 text-xs text-slate-500">
                                                                {note.author_username}
                                                                {note.visible_to_student ? ` - ${texts.visible.toLowerCase()}` : ''}
                                                                {note.created_at ? ` - ${new Date(note.created_at).toLocaleDateString()}` : ''}
                                                            </span>
                                                        </span>
                                                        <button
                                                            type="button"
                                                            title={texts.deleteNote}
                                                            onClick={() => void deleteNote(note.id)}
                                                            className="text-slate-500 hover:text-red-600"
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
                                            <p className="flex items-center gap-1 text-xs font-semibold uppercase text-slate-500">
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
                </div>
            )}

            <button
                type="button"
                onClick={() => void load()}
                className="inline-flex min-h-[36px] items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
            >
                <RefreshCw className="h-3.5 w-3.5" /> {texts.refresh}
            </button>
        </div>
    );
}
