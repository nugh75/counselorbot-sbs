import type { Lang } from './i18n';
import type { TeacherAreaSlug } from './teacher-area';

type Localized = readonly [string, string, string, string, string, string];
const languages: readonly Lang[] = ['it', 'en', 'es', 'fr', 'de', 'sv'];

const labels = {
    title: ['Area docenti', 'Teacher area', 'Área docente', 'Espace enseignant', 'Lehrkräftebereich', 'Lärarområde'],
    subtitle: [
        "Configura gli obiettivi, gestisci gruppi, classi e somministrazioni e amplia i cataloghi di strategie, libri, film e altri materiali.",
        "Configure goals, manage groups, classes and administration plans, and expand the catalogs of strategies, books, films and other resources.",
        "Configura objetivos, gestiona grupos, clases y planes de administración y amplía los catálogos de estrategias, libros, películas y otros materiales.",
        "Configurez les objectifs, gérez les groupes, les classes et les plans de passation, et enrichissez les catalogues de stratégies, de livres, de films et d’autres ressources.",
        "Legen Sie Ziele fest, verwalten Sie Gruppen, Klassen und Durchführungspläne und erweitern Sie die Kataloge für Strategien, Bücher, Filme und andere Materialien.",
        "Konfigurera mål, hantera grupper, klasser och genomförandeplaner och utöka katalogerna med strategier, böcker, filmer och annat material.",
    ],
    goalPathTitle: [
        'Percorso guidato: obiettivi per la mia classe',
        'Guided path: objectives for my class',
        'Recorrido guiado: objetivos para mi clase',
        'Parcours guidé : objectifs pour ma classe',
        'Begleiteter Weg: Ziele für meine Klasse',
        'Väglett arbetssätt: mål för min klass',
    ],
    goalPathDescription: [
        'Imposta un obiettivo didattico per la tua classe con la tassonomia di Bloom, la prova SMART e l’allineamento con attività e valutazione.',
        "Set a didactic objective for your class with Bloom's taxonomy, the SMART check and alignment with activities and assessment.",
        'Fija un objetivo didáctico para tu clase con la taxonomía de Bloom, la prueba SMART y la alineación con actividades y evaluación.',
        'Fixez un objectif didactique pour votre classe avec la taxonomie de Bloom, l’épreuve SMART et l’alignement avec les activités et l’évaluation.',
        'Legen Sie ein Unterrichtsziel für Ihre Klasse fest: Bloom-Taxonomie, SMART-Test und Abstimmung mit Aktivitäten und Bewertung.',
        'Sätt ett undervisningsmål för din klass med Blooms taxonomi, SMART-testet och anpassning till aktiviteter och bedömning.',
    ],
    forbidden: [
        'Pagina riservata a docenti, ricercatori e amministratori.',
        'This page is reserved for teachers, researchers and administrators.',
        'Esta página está reservada a docentes, investigadores y administradores.',
        'Cette page est réservée aux enseignants, chercheurs et administrateurs.',
        'Diese Seite ist Lehrkräften, Forschenden und Administratoren vorbehalten.',
        'Den här sidan är endast för lärare, forskare och administratörer.',
    ],
    back: ['Torna a CounselorBot', 'Back to CounselorBot', 'Volver a CounselorBot', 'Retour à CounselorBot', 'Zurück zu CounselorBot', 'Tillbaka till CounselorBot'],
    notebookNote: [
        'Il taccuino qui sotto parla del tuo ruolo di docente: entra nella chat degli obiettivi didattici. Il tuo eventuale taccuino da studente resta nell’area personale e non entra in questa conversazione.',
        'The notebook below is about your role as a teacher: it feeds the didactic-objective chat. Your student notebook, if any, stays in the personal area and never enters this conversation.',
        'El cuaderno de abajo habla de tu rol docente: entra en la chat de objetivos didácticos. Tu cuaderno de estudiante, si lo tienes, queda en el área personal y no entra en esta conversación.',
        'Le carnet ci-dessous parle de votre rôle d’enseignant : il alimente la conversation sur les objectifs didactiques. Votre carnet d’étudiant, s’il existe, reste dans l’espace personnel et n’y entre pas.',
        'Das Notizbuch unten betrifft Ihre Rolle als Lehrkraft: es fließt in den Chat über Unterrichtsziele ein. Ihr Studierenden-Notizbuch bleibt im persönlichen Bereich und kommt hier nicht hinein.',
        'Anteckningsboken nedan handlar om din roll som lärare: den matar målchatten. Din eventuella studentanteckningsbok finns kvar i den personliga vyn och kommer inte in i det här samtalet.',
    ],
    classroom: ['Classe e assegnazioni', 'Class and assignments', 'Clase y asignaciones', 'Classe et attributions', 'Klasse und Zuweisungen', 'Klass och tilldelningar'],
    catalogs: ['Cataloghi', 'Catalogs', 'Catálogos', 'Catalogues', 'Kataloge', 'Kataloger'],
    research: ['Somministrazioni e ricerca', 'Administration and research', 'Administración e investigación', 'Passations et recherche', 'Durchführungen und Forschung', 'Genomföranden och forskning'],
    notebook: ['Taccuino del docente', 'Teacher notebook', 'Cuaderno del docente', 'Carnet de l’enseignant', 'Lehrkräfte-Notizbuch', 'Lärarens anteckningsbok'],
} satisfies Record<string, Localized>;

const names = {
    classi: ['Gruppi e classi', 'Groups and classes', 'Grupos y clases', 'Groupes et classes', 'Gruppen und Klassen', 'Grupper och klasser'],
    assegnazioni: ['Assegnazioni effettuate', 'Sent assignments', 'Asignaciones realizadas', 'Attributions effectuées', 'Gesendete Zuweisungen', 'Skickade tilldelningar'],
    'catalogo-obiettivi': ['Catalogo obiettivi', 'Goal catalog', 'Catálogo de objetivos', 'Catalogue d’objectifs', 'Zielkatalog', 'Målkatalog'],
    strategie: ['Strategie', 'Strategies', 'Estrategias', 'Stratégies', 'Strategien', 'Strategier'],
    materiali: ['Letture, film e materiali', 'Readings, films and resources', 'Lecturas, películas y materiales', 'Lectures, films et ressources', 'Lektüren, Filme und Materialien', 'Läsningar, filmer och material'],
    orientamento: ['Orientamento dell’istituto', 'Institution guidance', 'Orientación de la institución', 'Orientation de l’établissement', 'Orientierung der Einrichtung', 'Institutionens vägledning'],
    somministrazioni: ['Piani di somministrazione', 'Administration plans', 'Planes de administración', 'Plans d’administration', 'Durchführungspläne', 'Administreringsplaner'],
} satisfies Record<TeacherAreaSlug, Localized>;

const descriptions = {
    classi: [
        'Crea classi e gruppi, distribuisci il codice di invito e scrivi il contesto della classe.',
        'Create classes and groups, share the invite code and write the class context.',
        'Crea clases y grupos, comparte el código de invitación y escribe el contexto de la clase.',
        'Créez des classes et des groupes, partagez le code d’invitation et rédigez le contexte de la classe.',
        'Erstellen Sie Klassen und Gruppen, verteilen Sie den Einladungscode und schreiben Sie den Klassenkontext.',
        'Skapa klasser och grupper, dela inbjudningskoden och skriv klassens kontext.',
    ],
    assegnazioni: [
        'Vedi le assegnazioni inviate, i destinatari e le restituzioni da valutare.',
        'See the assignments you sent, the recipients and the responses to review.',
        'Consulta las asignaciones enviadas, los destinatarios y las respuestas por revisar.',
        'Consultez les attributions envoyées, les destinataires et les réponses à évaluer.',
        'Sehen Sie gesendete Zuweisungen, Empfänger und die zu bewertenden Rückmeldungen.',
        'Se skickade tilldelningar, mottagare och svar att bedöma.',
    ],
    'catalogo-obiettivi': [
        'Crea e pubblica proposte di obiettivo, comuni o per i tuoi gruppi.',
        'Create and publish goal proposals, common or scoped to your groups.',
        'Crea y publica propuestas de objetivos, comunes o para tus grupos.',
        'Créez et publiez des propositions d’objectifs, communes ou pour vos groupes.',
        'Erstellen und veröffentlichen Sie Zielvorschläge, gemeinsame oder für Ihre Gruppen.',
        'Skapa och publicera målförslag, gemensamma eller för dina grupper.',
    ],
    strategie: [
        'Pubblica strategie di studio e di vita da proporre a chi segue.',
        'Publish study and life strategies to offer to your learners.',
        'Publica estrategias de estudio y de vida para ofrecer a quien acompaña.',
        'Publiez des stratégies d’étude et de vie à proposer à votre public.',
        'Veröffentlichen Sie Lern- und Lebensstrategien für Ihre Begleiteten.',
        'Publicera studie- och livsstrategier att erbjuda dina deltagare.',
    ],
    materiali: [
        'Gestisci il catalogo di letture, film e altro materiale certificato.',
        'Manage your catalog of certified readings, films and other resources.',
        'Gestiona el catálogo de lecturas, películas y otro material certificado.',
        'Gérez le catalogue de lectures, films et autres ressources certifiées.',
        'Verwalten Sie den Katalog der zertifizierten Lektüren, Filme und Materialien.',
        'Hantera katalogen med certifierade läsningar, filmer och material.',
    ],
    orientamento: [
        'Organizza le categorie dei contatti e degli appuntamenti del tuo istituto.',
        'Organize the categories of your institution’s contacts and appointments.',
        'Organiza las categorías de contactos y citas de tu institución.',
        'Organisez les catégories des contacts et rendez-vous de votre établissement.',
        'Ordnen Sie die Kategorien der Kontakte und Termine Ihrer Einrichtung.',
        'Ordna kategorierna för din institutions kontakter och tider.',
    ],
    somministrazioni: [
        'Prepara somministrazioni con codice AP, ricercatori e gruppi collegati.',
        'Prepare administrations with an AP code, researchers and linked groups.',
        'Prepara administraciones con código AP, investigadores y grupos vinculados.',
        'Préparez des passations avec code AP, chercheurs et groupes associés.',
        'Bereiten Sie Durchführungen mit AP-Code, Forschenden und Gruppen vor.',
        'Förbered genomföranden med AP-kod, forskare och kopplade grupper.',
    ],
} satisfies Record<TeacherAreaSlug, Localized>;

const languageIndex = (lang: Lang) => Math.max(0, languages.indexOf(lang) === -1 ? 0 : languages.indexOf(lang));
export const teacherAreaText = (lang: Lang, key: keyof typeof labels) => labels[key][languageIndex(lang)];
export const teacherAreaName = (lang: Lang, slug: TeacherAreaSlug) => names[slug][languageIndex(lang)];
export const teacherAreaDescription = (lang: Lang, slug: TeacherAreaSlug) => descriptions[slug][languageIndex(lang)];
