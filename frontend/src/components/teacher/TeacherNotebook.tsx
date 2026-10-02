'use client';

// Taccuino del docente: auto-descrizione del suo ruolo (discipline, esperienza,
// metodologie, incarichi). Salvataggio esplicito append-only; la chat usa
// queste note quando il taccuino docente è scelto o previsto dal default.

import { useEffect, useRef, useState } from 'react';
import { NotebookPen } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n-context';
import { apiFetch, getViewAsAccount } from '@/lib/auth';
import { useTeacherResource } from './useTeacherResource';
import { TeacherForbidden } from './TeacherAccess';
import { teacherLoadingText } from '@/lib/i18n-teacher-loading';
import { useDraftGuard } from '@/lib/use-draft-guard';
import { learningText } from '@/lib/i18n-assignment-work';
import { notebookLinkText, notebookToolLinks } from '@/lib/teacher-notebook-links';

const TEXTS = {
    it: {
        title: 'Taccuino del docente',
        subtitle: "Descrivi il tuo ruolo e la tua pratica abituale. Tutti i campi sono facoltativi. La chat «Obiettivi per la mia classe» usa queste note per impostazione predefinita; negli altri strumenti il default è il taccuino dello studente. Nelle Opzioni puoi scegliere quale taccuino usare.",
        subjects: 'Discipline insegnate',
        subjectsPlaceholder: 'Es. matematica e fisica, scienze naturali...',
        experience: "Esperienza di insegnamento",
        experiencePlaceholder: "Es. insegno da tre anni, ho lavorato nella formazione adulti",
        methodologies: "Come insegno di solito",
        methodologiesPlaceholder: 'Es. cooperative learning, flipped classroom, laboratorio...',
        classes: "Panoramica dei miei incarichi",
        classesPlaceholder: "Es. secondaria e formazione adulti, incarichi su due sedi",
        formation: "Interessi per la mia crescita",
        formationPlaceholder: "Es. vorrei imparare a dare feedback più chiari",
        notes: "Altre informazioni sul mio ruolo",
        notesPlaceholder: "Es. mi aiuta preparare consegne brevi",
        save: 'Salva taccuino',
        saved: 'Taccuino salvato',
        empty: "Taccuino vuoto: puoi procedere senza compilarlo. Descrivi in chat ciò che serve; negli obiettivi per la classe possono contribuire anche le classi selezionate, secondo il contesto scelto.",
        error: 'Operazione non riuscita.',
        subjectsHint: "Materie che insegni abitualmente, anche in contesti diversi.",
        experienceHint: "Una sintesi della tua esperienza e degli incarichi, non il racconto di una singola lezione o un archivio dei lavori.",
        methodologiesHint: "Descrivi la tua pratica abituale. Le specificità di una classe vanno nel suo Contesto classe; il metodo per un obiettivo si sceglie nell’obiettivo. Questa nota non pubblica schede nei cataloghi.",
        classesHint: "Una panoramica dei tuoi incarichi e contesti. I dettagli e la gestione della singola classe sono in Gruppi e classi. Questa nota non abilita permessi presso un istituto.",
        formationHint: "Che cosa vorresti imparare tu come docente? È un interesse per la tua crescita, non un obiettivo didattico per la classe; per renderlo concreto puoi lavorare su un obiettivo personale.",
        notesHint: "Una nota sintetica sul tuo ruolo. Episodi e lavori si possono rileggere o conservare con Evento professionale, Linea del tempo e Portfolio; evita dati identificativi dei partecipanti.",
        summary: "Scrivi in modo sintetico: la chat usa un contesto breve e può non includere tutte le note per intero. Esplicita nel turno i dettagli rilevanti.",
    },
    en: {
        title: 'Teacher notebook',
        subtitle: "Describe your role and usual teaching practice. All fields are optional. “Objectives for my class” uses these notes by default; other tools default to the student notebook. In Options you can choose which notebook to use.",
        subjects: 'Subjects taught',
        subjectsPlaceholder: 'e.g. mathematics and physics, natural sciences...',
        experience: "Teaching experience",
        experiencePlaceholder: "e.g. I have taught for three years and worked in adult education",
        methodologies: "How I usually teach",
        methodologiesPlaceholder: 'e.g. cooperative learning, flipped classroom, lab work (optional)',
        classes: "Overview of my teaching roles",
        classesPlaceholder: "e.g. secondary and adult education, roles at two sites",
        formation: "Interests for my own development",
        formationPlaceholder: "e.g. I would like to learn to give clearer feedback",
        notes: "Other information about my role",
        notesPlaceholder: "e.g. preparing short instructions helps me",
        save: 'Save notebook',
        saved: 'Notebook saved',
        empty: "Empty notebook: you can continue without filling it in. Describe what is needed in chat; for class objectives, selected classes can also contribute, depending on the chosen context.",
        error: 'Operation failed.',
        subjectsHint: "Subjects you usually teach, including across different settings.",
        experienceHint: "A summary of your experience and roles, rather than a single lesson story or an archive of your work.",
        methodologiesHint: "Describe your usual practice. Class-specific practices belong in that class’s Class context; a method for an objective is chosen in the objective. This note does not publish catalog entries.",
        classesHint: "An overview of your roles and settings. Details and management of individual classes belong in Groups and classes. This note does not grant institution permissions.",
        formationHint: "What would you like to learn as a teacher? This is an interest in your own development, not a teaching objective for the class; you can make it concrete through a personal goal.",
        notesHint: "A brief note about your role. Episodes and work can be reviewed or kept through Significant professional event, Timeline and Portfolio; avoid identifying participants.",
        summary: "Keep it brief: the chat uses a short context and may not include every note in full. State relevant details in your message.",
    },
    es: {
        title: 'Cuaderno del docente',
        subtitle: "Describe tu rol y tu práctica habitual. Todos los campos son opcionales. «Objetivos para mi clase» usa estas notas por defecto; las demás herramientas usan por defecto el cuaderno del estudiante. En Opciones puedes elegir qué cuaderno usar.",
        subjects: 'Disciplinas que enseñas',
        subjectsPlaceholder: 'Ej. matemáticas y física, ciencias naturales...',
        experience: "Experiencia docente",
        experiencePlaceholder: "Ej. enseño desde hace tres años y he trabajado en formación de adultos",
        methodologies: "Cómo enseño habitualmente",
        methodologiesPlaceholder: 'Ej. aprendizaje cooperativo, aula invertida, laboratorio (opcional)',
        classes: "Panorama de mis cargos docentes",
        classesPlaceholder: "Ej. secundaria y formación de adultos, cargos en dos centros",
        formation: "Intereses para mi propio desarrollo",
        formationPlaceholder: "Ej. quisiera aprender a dar comentarios más claros",
        notes: "Otra información sobre mi rol",
        notesPlaceholder: "Ej. me ayuda preparar instrucciones breves",
        save: 'Guardar cuaderno',
        saved: 'Cuaderno guardado',
        empty: "Cuaderno vacío: puedes continuar sin completarlo. Describe en la conversación lo necesario; en los objetivos para la clase también pueden contribuir las clases seleccionadas, según el contexto elegido.",
        error: 'La operación ha fallado.',
        subjectsHint: "Materias que enseñas habitualmente, también en distintos contextos.",
        experienceHint: "Una síntesis de tu experiencia y tus cargos, no el relato de una sola clase ni un archivo de trabajos.",
        methodologiesHint: "Describe tu práctica habitual. Las prácticas específicas de una clase van en su Contexto de clase; el método para un objetivo se elige en el objetivo. Esta nota no publica fichas en los catálogos.",
        classesHint: "Un panorama de tus cargos y contextos. Los detalles y la gestión de cada clase están en Grupos y clases. Esta nota no concede permisos en una institución.",
        formationHint: "¿Qué te gustaría aprender como docente? Es un interés para tu propio desarrollo, no un objetivo didáctico para la clase; puedes concretarlo mediante un objetivo personal.",
        notesHint: "Una nota breve sobre tu rol. Puedes revisar o conservar episodios y trabajos con Evento significativo profesional, Línea del tiempo y Portfolio; evita datos que identifiquen a los participantes.",
        summary: "Escribe de forma breve: la conversación usa un contexto resumido y puede no incluir todas las notas completas. Explicita los detalles relevantes en tu mensaje.",
    },
    fr: {
        title: 'Carnet de l’enseignant',
        subtitle: "Décrivez votre rôle et votre pratique habituelle. Tous les champs sont facultatifs. « Objectifs pour ma classe » utilise ces notes par défaut ; les autres outils utilisent par défaut le carnet de l’étudiant. Dans Options, vous pouvez choisir le carnet à utiliser.",
        subjects: 'Disciplines enseignées',
        subjectsPlaceholder: 'ex. mathématiques et physique, sciences naturelles...',
        experience: "Expérience d’enseignement",
        experiencePlaceholder: "Ex. j’enseigne depuis trois ans et j’ai travaillé en formation d’adultes",
        methodologies: "Comment j’enseigne habituellement",
        methodologiesPlaceholder: 'ex. apprentissage coopératif, classe inversée, laboratoire (facultatif)',
        classes: "Aperçu de mes fonctions",
        classesPlaceholder: "Ex. secondaire et formation d’adultes, fonctions sur deux sites",
        formation: "Intérêts pour mon développement",
        formationPlaceholder: "Ex. je voudrais apprendre à donner des retours plus clairs",
        notes: "Autres informations sur mon rôle",
        notesPlaceholder: "Ex. préparer des consignes courtes m’aide",
        save: 'Enregistrer le carnet',
        saved: 'Carnet enregistré',
        empty: "Carnet vide : vous pouvez continuer sans le remplir. Décrivez dans le chat ce qui est utile ; pour les objectifs de classe, les classes sélectionnées peuvent aussi contribuer, selon le contexte choisi.",
        error: 'L’opération a échoué.',
        subjectsHint: "Les matières que vous enseignez habituellement, dans différents contextes aussi.",
        experienceHint: "Une synthèse de votre expérience et de vos fonctions, plutôt que le récit d’un cours ou un recueil de travaux.",
        methodologiesHint: "Décrivez votre pratique habituelle. Les pratiques propres à une classe vont dans son Contexte de classe ; la méthode pour un objectif se choisit dans l’objectif. Cette note ne publie pas de fiches dans les catalogues.",
        classesHint: "Un aperçu de vos fonctions et contextes. Les détails et la gestion de chaque classe se trouvent dans Groupes et classes. Cette note n’accorde pas de droits dans un établissement.",
        formationHint: "Que souhaitez-vous apprendre comme enseignant ? Il s’agit de votre développement, pas d’un objectif didactique pour la classe ; vous pouvez le concrétiser par un objectif personnel.",
        notesHint: "Une note brève sur votre rôle. Les épisodes et travaux peuvent être relus ou conservés avec Événement significatif professionnel, Ligne du temps et Portfolio ; évitez d’identifier les participants.",
        summary: "Soyez concis : le chat utilise un contexte bref et peut ne pas inclure toutes les notes intégralement. Précisez les détails utiles dans votre message.",
    },
    de: {
        title: 'Lehrkräfte-Notizbuch',
        subtitle: "Beschreiben Sie Ihre Rolle und Ihre übliche Unterrichtspraxis. Alle Felder sind freiwillig. „Ziele für meine Klasse“ nutzt diese Notizen standardmäßig; andere Werkzeuge nutzen standardmäßig das Studierenden-Notizbuch. In den Optionen können Sie das Notizbuch wählen.",
        subjects: 'Unterrichtete Fächer',
        subjectsPlaceholder: 'z. B. Mathematik und Physik, Naturwissenschaften...',
        experience: "Unterrichtserfahrung",
        experiencePlaceholder: "z. B. seit drei Jahren im Unterricht, Erfahrung in der Erwachsenenbildung",
        methodologies: "Wie ich gewöhnlich unterrichte",
        methodologiesPlaceholder: 'z. B. kooperatives Lernen, Flipped Classroom, Labor (optional)',
        classes: "Überblick über meine Lehraufgaben",
        classesPlaceholder: "z. B. Sekundarstufe und Erwachsenenbildung, Aufgaben an zwei Standorten",
        formation: "Interessen für meine Entwicklung",
        formationPlaceholder: "z. B. ich möchte lernen, klarere Rückmeldungen zu geben",
        notes: "Weitere Angaben zu meiner Rolle",
        notesPlaceholder: "z. B. kurze Aufgabenstellungen vorzubereiten hilft mir",
        save: 'Notizbuch speichern',
        saved: 'Notizbuch gespeichert',
        empty: "Leer: Es geht auch ohne Notiz. Sagen Sie im Chat, was nötig ist. Bei Zielen für Ihre Klasse kann je nach Wahl auch eine Klasse helfen, die Sie im Chat wählen.",
        error: 'Der Vorgang ist fehlgeschlagen.',
        subjectsHint: "Fächer, die Sie gewöhnlich unterrichten, auch in unterschiedlichen Kontexten.",
        experienceHint: "Eine Zusammenfassung Ihrer Erfahrung und Aufgaben, kein Bericht über eine einzelne Stunde oder Archiv Ihrer Arbeiten.",
        methodologiesHint: "Beschreiben Sie Ihre übliche Praxis. Klassenspezifische Vorgehensweisen gehören in den Klassenkontext; eine Methode für ein Ziel wird beim Ziel gewählt. Diese Notiz veröffentlicht keine Katalogeinträge.",
        classesHint: "Ein Überblick über Ihre Aufgaben und Kontexte. Details und Verwaltung einzelner Klassen finden Sie unter Gruppen und Klassen. Diese Notiz gewährt keine Berechtigungen an einer Einrichtung.",
        formationHint: "Was möchten Sie als Lehrkraft lernen? Dies betrifft Ihre eigene Entwicklung, kein Unterrichtsziel für die Klasse; mit einem persönlichen Ziel können Sie es konkretisieren.",
        notesHint: "Eine kurze Notiz zu Ihrer Rolle. Ereignisse und Arbeiten können Sie mit Bedeutsames berufliches Ereignis, Zeitleiste und Portfolio reflektieren oder aufbewahren; vermeiden Sie identifizierende Angaben zu Teilnehmenden.",
        summary: "Fassen Sie sich kurz: Der Chat verwendet einen kurzen Kontext und enthält möglicherweise nicht jede Notiz vollständig. Nennen Sie relevante Details in Ihrer Nachricht.",
    },
    sv: {
        title: 'Lärarens anteckningsbok',
        subtitle: "Beskriv din roll och din vanliga undervisning. Alla fält är valfria. ”Mål för min klass” använder dessa anteckningar som standard; andra verktyg använder elevens anteckningsbok som standard. I Alternativ kan du välja vilken anteckningsbok som ska användas.",
        subjects: 'Ämnen du undervisar i',
        subjectsPlaceholder: 't.ex. matematik och fysik, naturvetenskap...',
        experience: "Undervisningserfarenhet",
        experiencePlaceholder: "T.ex. jag har undervisat i tre år och arbetat med vuxenutbildning",
        methodologies: "Hur jag brukar undervisa",
        methodologiesPlaceholder: 't.ex. kooperativt lärande, flippat klassrum, laboration (valfritt)',
        classes: "Översikt över mina läraruppdrag",
        classesPlaceholder: "T.ex. gymnasiet och vuxenutbildning, uppdrag på två platser",
        formation: "Intressen för min egen utveckling",
        formationPlaceholder: "T.ex. jag vill lära mig att ge tydligare återkoppling",
        notes: "Övrig information om min roll",
        notesPlaceholder: "T.ex. det hjälper mig att förbereda korta instruktioner",
        save: 'Spara anteckningsboken',
        saved: 'Anteckningsboken sparad',
        empty: "Tomt: du kan gå vidare utan att fylla i. Skriv i chatten vad du vill ta upp. Även valda klasser kan bidra till mål för din klass, om ditt val av kontext medger det.",
        error: 'Åtgärden misslyckades.',
        subjectsHint: "Ämnen som du vanligtvis undervisar i, även i olika sammanhang.",
        experienceHint: "En sammanfattning av din erfarenhet och dina uppdrag, inte berättelsen om en enskild lektion eller ett arkiv över arbeten.",
        methodologiesHint: "Beskriv din vanliga undervisning. Klassens särskilda arbetssätt hör till dess Klasskontext; en metod för ett mål väljs i målet. Den här anteckningen publicerar inga katalogposter.",
        classesHint: "En översikt över dina uppdrag och sammanhang. Detaljer och förvaltning av enskilda klasser finns i Grupper och klasser. Anteckningen ger inga behörigheter vid en institution.",
        formationHint: "Vad vill du lära dig som lärare? Det gäller din egen utveckling, inte ett undervisningsmål för klassen; du kan göra det konkret genom ett personligt mål.",
        notesHint: "En kort anteckning om din roll. Händelser och arbeten kan du reflektera över eller spara med Betydelsefull yrkeshändelse, Tidslinje och Portfolio; undvik uppgifter som identifierar deltagarna.",
        summary: "Skriv kortfattat: chatten använder ett kort sammanhang och kanske inte tar med alla anteckningar i sin helhet. Ange relevanta detaljer i ditt meddelande.",
    },
};

const FIELDS = [
    ['subjects', 'subjects', 'subjectsPlaceholder', 'subjectsHint'],
    ['experience', 'experience', 'experiencePlaceholder', 'experienceHint'],
    ['methodologies', 'methodologies', 'methodologiesPlaceholder', 'methodologiesHint'],
    ['classes_overview', 'classes', 'classesPlaceholder', 'classesHint'],
    ['formation_interests', 'formation', 'formationPlaceholder', 'formationHint'],
    ['notes', 'notes', 'notesPlaceholder', 'notesHint'],
] as const;

function parseNotebook(payload: unknown): Record<string, string> {
    if (payload === null) return {};
    if (!payload || typeof payload !== 'object' || !('data' in payload)
        || !payload.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) throw new Error('invalid notebook');
    return Object.fromEntries(FIELDS.map(([key]) => {
        const value = (payload.data as Record<string, unknown>)[key];
        if (value != null && typeof value !== 'string') throw new Error('invalid field');
        return [key, value ?? ''];
    }));
}

export function TeacherNotebook() {
    const { lang, t } = useI18n();
    const texts = TEXTS[lang as keyof typeof TEXTS] ?? TEXTS.en;
    const [values, setValues] = useState<Record<string, string>>({});
    const [baseline, setBaseline] = useState<Record<string, string>>({});
    const { data, loading, failed, forbidden, reload } = useTeacherResource('/api/user/teacher-notebook', parseNotebook);
    const loaded = data !== undefined && !forbidden;
    const [busy, setBusy] = useState(false);
    const [savedFlash, setSavedFlash] = useState(false);
    const [error, setError] = useState('');
    const dirty = useRef(false);
    const editVersion = useRef(0);
    const pendingSave = useRef<AbortController | null>(null);
    const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasChanges = loaded && FIELDS.some(([key]) => (values[key] ?? '') !== (baseline[key] ?? ''));
    useDraftGuard(hasChanges || busy, learningText(lang, 'leaveDraft'), { blocked: busy, preserveFocus: true });

    useEffect(() => {
        // A successful reread must not replace the user's unsaved text.
        if (data !== undefined && !dirty.current) { setValues(data); setBaseline(data); }
    }, [data]);
    useEffect(() => { dirty.current = hasChanges; }, [hasChanges]);
    useEffect(() => () => {
        pendingSave.current?.abort();
        if (flashTimer.current) clearTimeout(flashTimer.current);
    }, []);

    const save = async () => {
        if (!loaded || loading || pendingSave.current) return;
        const controller = new AbortController();
        pendingSave.current = controller;
        const version = editVersion.current;
        const account = getViewAsAccount()?.username;
        const current = () => !controller.signal.aborted && account === getViewAsAccount()?.username;
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
                signal: controller.signal,
            });
            if (!current()) return;
            if (!res.ok) throw new Error('save failed');
            const savedValues = Object.fromEntries(FIELDS.map(([key]) => [key, body[key] ?? '']));
            setBaseline(savedValues);
            if (version === editVersion.current) {
                setValues(savedValues);
                dirty.current = false;
                setSavedFlash(true);
                if (flashTimer.current) clearTimeout(flashTimer.current);
                flashTimer.current = setTimeout(() => setSavedFlash(false), 1500);
            }
        } catch {
            if (current()) setError(texts.error);
        } finally {
            if (current()) setBusy(false);
            if (pendingSave.current === controller) pendingSave.current = null;
        }
    };

    if (forbidden) return <TeacherForbidden />;

    return (
        <div className="rounded-lg border border-indigo-200 bg-white p-4">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
                <NotebookPen className="h-5 w-5 text-indigo-600" /> {texts.title}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">{texts.subtitle}</p>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">{texts.summary}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {FIELDS.map(([key, labelKey, placeholderKey, hintKey]) => (
                    <div key={key} className={key === 'notes' ? 'sm:col-span-2' : ''}>
                        <label className="block text-xs font-semibold text-slate-600" htmlFor={`teacher-notebook-${key}`}>
                            {texts[labelKey as keyof typeof texts] as string}
                        </label>
                        <textarea
                            id={`teacher-notebook-${key}`}
                            aria-describedby={`teacher-notebook-${key}-hint`}
                            value={values[key] ?? ''}
                            disabled={!loaded}
                            onChange={(event) => {
                                dirty.current = true;
                                editVersion.current++;
                                setSavedFlash(false);
                                setValues((prev) => ({ ...prev, [key]: event.target.value }));
                            }}
                            placeholder={texts[placeholderKey as keyof typeof texts] as string}
                            rows={2}
                            maxLength={600}
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                        <p id={`teacher-notebook-${key}-hint`} className="mt-1 text-xs text-slate-500">
                            {texts[hintKey]}
                        </p>
                        {notebookToolLinks.filter(link => link.field === key).map(link => (
                            <Link key={link.href} href={link.href}
                                className="mr-3 inline-flex min-h-[44px] items-center text-xs font-semibold text-indigo-700 underline underline-offset-2 hover:text-indigo-900 focus-visible:outline-2 focus-visible:outline-offset-2">
                                {notebookLinkText(lang, link.label)}
                            </Link>
                        ))}
                    </div>
                ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
                <button
                    type="button"
                    disabled={busy || loading || !loaded}
                    onClick={() => void save()}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {savedFlash ? texts.saved : texts.save}
                </button>
                {!failed && loaded && <button type="button" disabled={loading || busy} onClick={() => void reload()}
                    className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{t('common.refresh')}</button>}
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                {loaded && !loading && !failed && !savedFlash && !Object.values(values).some((v) => (v ?? '').trim()) && (
                    <p className="text-xs text-slate-500">{texts.empty}</p>
                )}
            </div>
            {busy && <p role="status" className="mt-2 text-xs text-slate-500">{notebookLinkText(lang, 'saving')}</p>}
            {loading && <p role="status" className="mt-3 text-sm text-slate-500">{t('common.loading')}</p>}
            {failed && <div role="alert" className="mt-3 flex flex-wrap items-center gap-3 text-sm text-red-600">
                <p>{teacherLoadingText(lang, 'notebook')}</p>
                <button type="button" disabled={loading || busy} onClick={() => void reload()}
                    className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">{t('setup.retry')}</button>
            </div>}
        </div>
    );
}
