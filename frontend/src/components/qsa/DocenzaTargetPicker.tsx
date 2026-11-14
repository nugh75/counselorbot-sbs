'use client';

// Prima della chat Obiettivi per la classe (OBIETTIVO_DOCENZA, #903): il docente
// sceglie per chi è l'obiettivo, una o più classi, studenti delle sue classi,
// suoi studenti di prova. Nessuna scelta studente di prova / dati propri: la
// chat parla sempre dal taccuino del docente. Le classi riusano DocenzaClassBar
// (stessa preferenza del browser); studenti e studenti di prova viaggiano nello
// snapshot e il server li riverifica a ogni salvataggio.

import { useEffect, useState, type ReactNode } from 'react';
import { FlaskConical, Loader2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { BackButton } from '@/components/ui/BackButton';
import { ForwardButton } from '@/components/ui/ForwardButton';
import { DocenzaClassBar, readStoredDocenzaGroupIds } from '@/components/qsa/DocenzaClassBar';
import { useTeacherResource } from '@/components/teacher/useTeacherResource';
import { practiceNotebookApi } from '@/lib/practice-notebooks-api';
import type { PracticeNotebook } from '@/lib/practice-notebooks';
import { NO_DOCENZA_TARGETS, hasDocenzaTarget, toggleDocenzaStudent, type DocenzaTargets } from '@/lib/docenza-groups';

const TEXTS = {
    it: {
        title: 'Per chi è questo obiettivo?',
        hint: 'Scegli una o più classi, studenti delle tue classi o studenti di prova. Puoi combinarli.',
        students: 'Studenti delle tue classi',
        studentsClass: 'Classe',
        studentsPick: 'Scegli una classe',
        studentsNone: 'Nessuno studente iscritto in questa classe.',
        practice: 'Studenti di prova',
        practiceNone: 'Nessuno studente di prova: puoi crearne uno in Studenti di prova.',
        error: 'Impossibile caricare l’elenco.',
        required: 'Scegli almeno una classe, uno studente o uno studente di prova.',
        start: 'Inizia la chat',
    },
    en: {
        title: 'Who is this goal for?',
        hint: 'Pick one or more classes, students of your classes or test students. You can combine them.',
        students: 'Students of your classes',
        studentsClass: 'Class',
        studentsPick: 'Pick a class',
        studentsNone: 'No students enrolled in this class.',
        practice: 'Test students',
        practiceNone: 'No test students yet: you can create one in Test students.',
        error: 'Could not load the list.',
        required: 'Pick at least one class, student or test student.',
        start: 'Start the chat',
    },
    es: {
        title: '¿Para quién es este objetivo?',
        hint: 'Elige una o más clases, estudiantes de tus clases o estudiantes de prueba. Puedes combinarlos.',
        students: 'Estudiantes de tus clases',
        studentsClass: 'Clase',
        studentsPick: 'Elige una clase',
        studentsNone: 'No hay estudiantes inscritos en esta clase.',
        practice: 'Estudiantes de prueba',
        practiceNone: 'Aún no hay estudiantes de prueba: puedes crear uno en Estudiantes de prueba.',
        error: 'No se pudo cargar la lista.',
        required: 'Elige al menos una clase, un estudiante o un estudiante de prueba.',
        start: 'Empezar la chat',
    },
    fr: {
        title: 'Pour qui est cet objectif ?',
        hint: 'Choisissez une ou plusieurs classes, des élèves de vos classes ou des élèves de test. Vous pouvez les combiner.',
        students: 'Élèves de vos classes',
        studentsClass: 'Classe',
        studentsPick: 'Choisissez une classe',
        studentsNone: 'Aucun élève inscrit dans cette classe.',
        practice: 'Élèves de test',
        practiceNone: 'Pas encore d’élève de test : vous pouvez en créer un dans Élèves de test.',
        error: 'Impossible de charger la liste.',
        required: 'Choisissez au moins une classe, un élève ou un élève de test.',
        start: 'Commencer la conversation',
    },
    de: {
        title: 'Für wen ist dieses Ziel?',
        hint: 'Wählen Sie eine oder mehrere Klassen, Lernende Ihrer Klassen oder Testlernende. Sie können sie kombinieren.',
        students: 'Lernende Ihrer Klassen',
        studentsClass: 'Klasse',
        studentsPick: 'Klasse wählen',
        studentsNone: 'In dieser Klasse sind keine Lernenden eingeschrieben.',
        practice: 'Testlernende',
        practiceNone: 'Noch keine Testlernenden: Sie können unter Testlernende welche anlegen.',
        error: 'Die Liste konnte nicht geladen werden.',
        required: 'Wählen Sie mindestens eine Klasse, eine lernende Person oder eine Testperson.',
        start: 'Chat starten',
    },
    sv: {
        title: 'Vem är det här målet för?',
        hint: 'Välj en eller flera klasser, elever i dina klasser eller testelever. Du kan kombinera dem.',
        students: 'Elever i dina klasser',
        studentsClass: 'Klass',
        studentsPick: 'Välj en klass',
        studentsNone: 'Inga elever är inskrivna i den här klassen.',
        practice: 'Testelever',
        practiceNone: 'Inga testelever ännu: du kan skapa en under Testelever.',
        error: 'Listan kunde inte laddas.',
        required: 'Välj minst en klass, en elev eller en testelev.',
        start: 'Starta chatten',
    },
};

const STORAGE_KEY = 'cb-docenza-targets';

export function readStoredDocenzaTargets(): DocenzaTargets {
    if (typeof window === 'undefined') return NO_DOCENZA_TARGETS;
    try {
        const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
        return {
            students: Array.isArray(parsed.students)
                ? parsed.students.filter((row: unknown): row is DocenzaTargets['students'][number] =>
                    typeof row === 'object' && row !== null && Number.isInteger((row as { group_id?: unknown }).group_id) && typeof (row as { username?: unknown }).username === 'string')
                : [],
            practiceIds: Array.isArray(parsed.practiceIds) ? parsed.practiceIds.filter((id: unknown) => Number.isInteger(id)) : [],
        };
    } catch {
        return NO_DOCENZA_TARGETS;
    }
}

function storeDocenzaTargets(targets: DocenzaTargets): void {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(targets)); } catch { /* storage pieno */ }
}

interface TeacherGroup { id: number; name: string; is_active: boolean }

function parseGroups(payload: unknown): TeacherGroup[] {
    if (!Array.isArray(payload)) throw new Error('invalid groups');
    return payload as TeacherGroup[];
}

function Pill({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" aria-pressed={selected} onClick={onClick}
            className={cn(
                'min-h-control rounded-full border px-4 py-1 text-xs font-semibold transition-colors',
                selected ? 'border-brand bg-brand text-ink-on-brand' : 'border-line-strong bg-surface text-ink-muted hover:border-brand-line hover:bg-brand-soft',
            )}>
            {children}
        </button>
    );
}

export function DocenzaTargetPicker({ onConfirm, onBack }: { onConfirm: () => void; onBack?: () => void }) {
    const { lang, t } = useI18n();
    const texts = TEXTS[lang as keyof typeof TEXTS] ?? TEXTS.en;
    const [groupIds, setGroupIds] = useState<number[]>(readStoredDocenzaGroupIds);
    const [targets, setTargets] = useState<DocenzaTargets>(readStoredDocenzaTargets);
    const { data: groups } = useTeacherResource('/api/admin/groups?own=true', parseGroups);
    const activeGroups = (groups ?? []).filter((group) => group.is_active);
    const [studentsGroupId, setStudentsGroupId] = useState<number | null>(null);
    const [members, setMembers] = useState<{ status: 'idle' | 'loading' | 'ready' | 'failed'; usernames: string[] }>({ status: 'idle', usernames: [] });
    const [notebooks, setNotebooks] = useState<PracticeNotebook[] | null>(null);
    const [notebooksFailed, setNotebooksFailed] = useState(false);

    useEffect(() => {
        const controller = new AbortController();
        practiceNotebookApi.list(false, controller.signal).then(setNotebooks).catch(() => { if (!controller.signal.aborted) setNotebooksFailed(true); });
        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (studentsGroupId === null) return;
        const controller = new AbortController();
        queueMicrotask(() => { if (!controller.signal.aborted) setMembers({ status: 'loading', usernames: [] }); });
        apiFetch(`/api/admin/groups/${studentsGroupId}/students`, { signal: controller.signal })
            .then((response) => { if (!response.ok) throw new Error('students'); return response.json(); })
            .then((payload: { students?: { username: string }[] }) => {
                if (!controller.signal.aborted) setMembers({ status: 'ready', usernames: (payload.students ?? []).map((row) => row.username) });
            })
            .catch(() => { if (!controller.signal.aborted) setMembers({ status: 'failed', usernames: [] }); });
        return () => controller.abort();
    }, [studentsGroupId]);

    const update = (next: DocenzaTargets) => {
        setTargets(next);
        storeDocenzaTargets(next);
    };
    const groupName = (id: number) => activeGroups.find((group) => group.id === id)?.name ?? '';
    const ready = hasDocenzaTarget(groupIds, targets);

    return (
        <section className="max-w-3xl space-y-4" data-docenza-targets>
            <div className="flex items-center gap-3">
                {onBack && <BackButton onClick={onBack} label={t('nav.back')} />}
                <ForwardButton onClick={onConfirm} disabled={!ready} label={texts.start} />
            </div>
            <div>
                <h2 className="text-lg font-semibold text-ink">{texts.title}</h2>
                <p className="mt-1 text-sm text-ink-muted">{texts.hint}</p>
            </div>
            <DocenzaClassBar selected={groupIds} onChange={setGroupIds} />
            <div className="border-t border-line pt-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><Users className="h-4 w-4 text-link" aria-hidden="true" />{texts.students}</h3>
                <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    {texts.studentsClass}
                    <select value={studentsGroupId ?? ''} onChange={(event) => setStudentsGroupId(event.target.value ? Number(event.target.value) : null)}
                        className="min-h-control min-w-0 rounded-control border border-line-strong bg-surface px-2 text-sm text-ink">
                        <option value="">{texts.studentsPick}</option>
                        {activeGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                    </select>
                </label>
                {studentsGroupId !== null && members.status === 'loading' && <p role="status" className="mt-2 flex items-center gap-1 text-xs text-ink-muted"><Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> {t('common.loading')}</p>}
                {studentsGroupId !== null && members.status === 'failed' && <p role="alert" className="mt-2 text-xs text-danger">{texts.error}</p>}
                {studentsGroupId !== null && members.status === 'ready' && (members.usernames.length === 0
                    ? <p className="mt-2 text-xs text-ink-muted">{texts.studentsNone}</p>
                    : <div className="mt-2 flex flex-wrap gap-2">
                        {members.usernames.map((username) => {
                            const target = { group_id: studentsGroupId, username };
                            const selected = targets.students.some((row) => row.group_id === studentsGroupId && row.username === username);
                            return <Pill key={username} selected={selected} onClick={() => update({ ...targets, students: toggleDocenzaStudent(targets.students, target) })}>{username}</Pill>;
                        })}
                    </div>)}
                {targets.students.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2" data-docenza-chosen-students>
                        {targets.students.filter((row) => row.group_id !== studentsGroupId).map((row) => (
                            <Pill key={`${row.group_id}:${row.username}`} selected onClick={() => update({ ...targets, students: toggleDocenzaStudent(targets.students, row) })}>
                                {row.username}{groupName(row.group_id) ? ` · ${groupName(row.group_id)}` : ''}
                            </Pill>
                        ))}
                    </div>
                )}
            </div>
            <div className="border-t border-line pt-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink"><FlaskConical className="h-4 w-4 text-link" aria-hidden="true" />{texts.practice}</h3>
                {notebooksFailed && <p role="alert" className="mt-2 text-xs text-danger">{texts.error}</p>}
                {notebooks?.length === 0 && <p className="mt-2 text-xs text-ink-muted">{texts.practiceNone}</p>}
                {notebooks && notebooks.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                        {notebooks.map((notebook) => {
                            const selected = targets.practiceIds.includes(notebook.id);
                            const practiceIds = selected ? targets.practiceIds.filter((id) => id !== notebook.id) : [...targets.practiceIds, notebook.id];
                            return <Pill key={notebook.id} selected={selected} onClick={() => update({ ...targets, practiceIds })}>{notebook.title}</Pill>;
                        })}
                    </div>
                )}
            </div>
            {!ready && <p className="text-xs text-ink-muted">{texts.required}</p>}
        </section>
    );
}
