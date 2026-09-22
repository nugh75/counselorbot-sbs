'use client';

// Taccuino del docente: auto-descrizione del suo ruolo (discipline, esperienza,
// metodologie, classi). Salvataggio esplicito append-only; il contenuto entra
// solo nella chat guidata degli obiettivi didattici (OBIETTIVO_DOCENZA).

import { useCallback, useEffect, useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { apiFetch } from '@/lib/auth';

const TEXTS = {
    it: {
        title: 'Taccuino del docente',
        subtitle: "Auto-descrizione del tuo ruolo: discipline, metodologie, esperienze. Entra nella chat degli obiettivi didattici per contextualizzare l'obiettivo nella tua pratica reale. Non è il taccuino dello studente.",
        subjects: 'Discipline insegnate',
        subjectsPlaceholder: 'Es. matematica e fisica, scienze naturali...',
        experience: 'Esperienza',
        experiencePlaceholder: 'Anni di insegnamento, percorsi, incarichi (opzionale)',
        methodologies: 'Metodologie d\'aula',
        methodologiesPlaceholder: 'Es. cooperative learning, flipped classroom, laboratorio...',
        classes: 'Classi e istituti',
        classesPlaceholder: 'Es. 3B al Fibonacci, primo anno di accademia (opzionale)',
        formation: 'Interessi di formazione',
        formationPlaceholder: 'Cosa ti piacerebbe sviluppare come docente (opzionale)',
        notes: 'Note',
        notesPlaceholder: 'Tutto ciò che ti riguarda come docente e vuoi far sapere alla conversazione (opzionale)',
        save: 'Salva taccuino',
        saved: 'Taccuino salvato',
        empty: 'Taccuino vuoto: la chat degli obiettivi lavorerà solo con ciò che scrivi a voce.',
        error: 'Operazione non riuscita.',
    },
    en: {
        title: 'Teacher notebook',
        subtitle: 'Your role in your own words: subjects, methodologies, experience. It feeds the didactic-objective chat so the objective fits your real practice. This is not the student notebook.',
        subjects: 'Subjects taught',
        subjectsPlaceholder: 'e.g. mathematics and physics, natural sciences...',
        experience: 'Experience',
        experiencePlaceholder: 'Years of teaching, paths, roles (optional)',
        methodologies: 'Classroom methodologies',
        methodologiesPlaceholder: 'e.g. cooperative learning, flipped classroom, lab work (optional)',
        classes: 'Classes and institutions',
        classesPlaceholder: 'e.g. 3B at the Fibonacci school, first academy year (optional)',
        formation: 'Professional development interests',
        formationPlaceholder: 'What you would like to develop as a teacher (optional)',
        notes: 'Notes',
        notesPlaceholder: 'Anything else about you as a teacher you want the conversation to know (optional)',
        save: 'Save notebook',
        saved: 'Notebook saved',
        empty: 'Empty notebook: the objectives chat will work only with what you say live.',
        error: 'Operation failed.',
    },
    es: {
        title: 'Cuaderno del docente',
        subtitle: 'Autodescripción de tu rol: disciplinas, metodologías, experiencia. Alimenta la chat de objetivos didácticos para situar el objetivo en tu práctica real. No es el cuaderno del estudiante.',
        subjects: 'Disciplinas que enseñas',
        subjectsPlaceholder: 'Ej. matemáticas y física, ciencias naturales...',
        experience: 'Experiencia',
        experiencePlaceholder: 'Años de docencia, trayectorias, cargos (opcional)',
        methodologies: 'Metodologías de aula',
        methodologiesPlaceholder: 'Ej. aprendizaje cooperativo, aula invertida, laboratorio (opcional)',
        classes: 'Clases e instituciones',
        classesPlaceholder: 'Ej. 3B en el centro Fibonacci, primer año de academia (opcional)',
        formation: 'Intereses de formación',
        formationPlaceholder: 'Qué te gustaría desarrollar como docente (opcional)',
        notes: 'Notas',
        notesPlaceholder: 'Todo lo que te afecta como docente y quieras que sepa la conversación (opcional)',
        save: 'Guardar cuaderno',
        saved: 'Cuaderno guardado',
        empty: 'Cuaderno vacío: la chat de objetivos trabajará solo con lo que digas en voz alta.',
        error: 'La operación ha fallado.',
    },
    fr: {
        title: 'Carnet de l’enseignant',
        subtitle: 'Autodescription de votre rôle : disciplines, méthodologies, expériences. Il alimente la conversation sur les objectifs didactiques pour ancrer l’objectif dans votre pratique réelle. Ce n’est pas le carnet de l’étudiant.',
        subjects: 'Disciplines enseignées',
        subjectsPlaceholder: 'ex. mathématiques et physique, sciences naturelles...',
        experience: 'Expérience',
        experiencePlaceholder: 'Années d’enseignement, parcours, fonctions (facultatif)',
        methodologies: 'Méthodologies de classe',
        methodologiesPlaceholder: 'ex. apprentissage coopératif, classe inversée, laboratoire (facultatif)',
        classes: 'Classes et établissements',
        classesPlaceholder: 'ex. 3B au lycée Fibonacci, première année d’académie (facultatif)',
        formation: 'Intérêts de formation',
        formationPlaceholder: 'Ce que vous aimeriez développer comme enseignant (facultatif)',
        notes: 'Notes',
        notesPlaceholder: 'Tout ce qui vous concerne comme enseignant et que la conversation doit savoir (facultatif)',
        save: 'Enregistrer le carnet',
        saved: 'Carnet enregistré',
        empty: 'Carnet vide : la conversation sur les objectifs ne comptera que sur ce que vous dites à voix haute.',
        error: 'L’opération a échoué.',
    },
    de: {
        title: 'Lehrkräfte-Notizbuch',
        subtitle: 'Selbstbeschreibung Ihrer Rolle: Fächer, Methoden, Erfahrungen. Es speist den Chat über Unterrichtsziele, damit das Ziel in Ihre echte Praxis passt. Es ist nicht das Notizbuch der Studierenden.',
        subjects: 'Unterrichtete Fächer',
        subjectsPlaceholder: 'z. B. Mathematik und Physik, Naturwissenschaften...',
        experience: 'Erfahrung',
        experiencePlaceholder: 'Jahre im Unterricht, Laufbahn, Funktionen (optional)',
        methodologies: 'Unterrichtsmethoden',
        methodologiesPlaceholder: 'z. B. kooperatives Lernen, Flipped Classroom, Labor (optional)',
        classes: 'Klassen und Einrichtungen',
        classesPlaceholder: 'z. B. 3B an der Schule Fibonacci, erstes Studienjahr (optional)',
        formation: 'Interessen an Fortbildung',
        formationPlaceholder: 'Was Sie als Lehrkraft entwickeln möchten (optional)',
        notes: 'Notizen',
        notesPlaceholder: 'Alles, was Sie als Lehrkraft betrifft und das Gespräch wissen soll (optional)',
        save: 'Notizbuch speichern',
        saved: 'Notizbuch gespeichert',
        empty: 'Leeres Notizbuch: der Ziele-Chat arbeitet nur mit dem, was Sie mündlich sagen.',
        error: 'Der Vorgang ist fehlgeschlagen.',
    },
    sv: {
        title: 'Lärarens anteckningsbok',
        subtitle: 'Självbeskrivning av din roll: ämnen, arbetssätt, erfarenheter. Den matar chatten om undervisningsmål så att målet passar din verkliga praktik. Det är inte studentens anteckningsbok.',
        subjects: 'Ämnen du undervisar i',
        subjectsPlaceholder: 't.ex. matematik och fysik, naturvetenskap...',
        experience: 'Erfarenhet',
        experiencePlaceholder: 'År av undervisning, bana, uppdrag (valfritt)',
        methodologies: 'Klassrumsarbetsätt',
        methodologiesPlaceholder: 't.ex. kooperativt lärande, flippat klassrum, laboration (valfritt)',
        classes: 'Klasser och institutioner',
        classesPlaceholder: 't.ex. 3B på Fibonacci-skolan, första skolåret (valfritt)',
        formation: 'Intressen i fortbildning',
        formationPlaceholder: 'Vad du vill utveckla som lärare (valfritt)',
        notes: 'Noteringar',
        notesPlaceholder: 'Allt om dig som lärare som samtalet bör veta (valfritt)',
        save: 'Spara anteckningsboken',
        saved: 'Anteckningsboken sparad',
        empty: 'Tom anteckningsbok: målchatten arbetar bara med det du säger muntligt.',
        error: 'Åtgärden misslyckades.',
    },
};

const FIELDS = [
    ['subjects', 'subjects', 'subjectsPlaceholder'],
    ['experience', 'experience', 'experiencePlaceholder'],
    ['methodologies', 'methodologies', 'methodologiesPlaceholder'],
    ['classes_overview', 'classes', 'classesPlaceholder'],
    ['formation_interests', 'formation', 'formationPlaceholder'],
    ['notes', 'notes', 'notesPlaceholder'],
] as const;

export function TeacherNotebook() {
    const { lang } = useI18n();
    const texts = TEXTS[lang as keyof typeof TEXTS] ?? TEXTS.en;
    const [values, setValues] = useState<Record<string, string>>({});
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [savedFlash, setSavedFlash] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(() => {
        apiFetch('/api/user/teacher-notebook')
            .then((res) => (res.ok ? res.json() : null))
            .then((payload: { data: Record<string, string> } | null) => {
                setValues(payload?.data ?? {});
            })
            .catch(() => setValues({}))
            .finally(() => setLoaded(true));
    }, []);

    useEffect(() => { load(); }, [load]);

    const save = async () => {
        setBusy(true);
        setError('');
        try {
            const body = Object.fromEntries(
                FIELDS.map(([key]) => [key, values[key]?.trim() || null]),
            );
            const res = await apiFetch('/api/user/teacher-notebook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error('save failed');
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 1500);
        } catch {
            setError(texts.error);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="rounded-lg border border-indigo-200 bg-white p-4">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
                <NotebookPen className="h-5 w-5 text-indigo-600" /> {texts.title}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">{texts.subtitle}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {FIELDS.map(([key, labelKey, placeholderKey]) => (
                    <div key={key} className={key === 'notes' ? 'sm:col-span-2' : ''}>
                        <label className="block text-xs font-semibold text-slate-600" htmlFor={`teacher-notebook-${key}`}>
                            {texts[labelKey as keyof typeof texts] as string}
                        </label>
                        <textarea
                            id={`teacher-notebook-${key}`}
                            value={values[key] ?? ''}
                            onChange={(event) => setValues((prev) => ({ ...prev, [key]: event.target.value }))}
                            placeholder={texts[placeholderKey as keyof typeof texts] as string}
                            rows={2}
                            maxLength={600}
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                    </div>
                ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => void save()}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {savedFlash ? texts.saved : texts.save}
                </button>
                {error && <p className="text-sm text-red-600">{error}</p>}
                {loaded && !savedFlash && !Object.values(values).some((v) => (v ?? '').trim()) && (
                    <p className="text-xs text-slate-500">{texts.empty}</p>
                )}
            </div>
        </div>
    );
}
