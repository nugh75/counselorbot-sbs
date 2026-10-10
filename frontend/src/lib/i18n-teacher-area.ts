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
        "Il taccuino descrive il tuo ruolo e la tua pratica abituale. Gli obiettivi per la classe usano per default il taccuino docente; gli altri strumenti quello dello studente. Nelle Opzioni della chat puoi scegliere Studente, Docente, Prova (un taccuino di prova) o Nessuno, oppure tornare a Predefinito. La scelta riguarda il contesto del taccuino, non tutti i dati della conversazione; Nessuno non rende la chat anonima.",
        "The notebook describes your role and usual practice. Class objectives default to the teacher notebook; other tools to the student notebook. In chat Options you can choose Student, Teacher, Practice (a practice notebook) or None, or return to Default. This choice concerns notebook context, not all conversation data; None does not make the chat anonymous.",
        "El cuaderno describe tu rol y tu práctica habitual. Los objetivos para la clase usan por defecto el cuaderno docente; las demás herramientas el del estudiante. En Opciones puedes elegir Estudiante, Docente, Práctica (un cuaderno de práctica) o Ninguno, o volver a Predeterminado. La elección afecta al contexto del cuaderno, no a todos los datos de la conversación; Ninguno no hace anónima la conversación.",
        "Le carnet décrit votre rôle et votre pratique habituelle. Les objectifs pour la classe utilisent par défaut le carnet enseignant ; les autres outils celui de l’étudiant. Dans Options, choisissez Étudiant, Enseignant, Entraînement (un carnet d’entraînement) ou Aucun, ou revenez à Par défaut. Ce choix concerne le contexte du carnet, pas toutes les données de la conversation ; Aucun ne rend pas le chat anonyme.",
        "Das Notizbuch beschreibt Ihre Rolle und übliche Praxis. Klassenziele nutzen standardmäßig das Lehrkräfte-Notizbuch; andere Werkzeuge das Studierenden-Notizbuch. In den Chat-Optionen können Sie Studierende, Lehrkraft, Übung (ein Übungs-Notizbuch) oder Keines wählen oder zu Standard zurückkehren. Die Wahl betrifft den Notizbuchkontext, nicht alle Gesprächsdaten; Keines macht den Chat nicht anonym.",
        "Anteckningsboken beskriver din roll och vanliga undervisning. Klassmål använder lärarens anteckningsbok som standard; andra verktyg elevens. I chattens Alternativ kan du välja Student, Lärare, Övning (en övningsanteckningsbok) eller Ingen, eller återgå till Standard. Valet gäller anteckningsbokens sammanhang, inte alla samtalsdata; Ingen gör inte chatten anonym.",
    ],
    classroom: ['Classe e assegnazioni', 'Class and assignments', 'Clase y asignaciones', 'Classe et attributions', 'Klasse und Zuweisungen', 'Klass och tilldelningar'],
    catalogs: ['Cataloghi', 'Catalogs', 'Catálogos', 'Catalogues', 'Kataloge', 'Kataloger'],
    research: ['Somministrazioni e ricerca', 'Administration and research', 'Administración e investigación', 'Passations et recherche', 'Durchführungen und Forschung', 'Genomföranden och forskning'],
    pathsChooseClass: ['Classe', 'Class', 'Clase', 'Classe', 'Klasse', 'Klass'],
    pathsNoClasses: [
        'Non hai ancora classi: creane una in Gruppi e classi per preparare un percorso.',
        'You have no classes yet: create one in Groups and classes to prepare a path.',
        'Todavía no tienes clases: crea una en Grupos y clases para preparar un itinerario.',
        'Vous n’avez pas encore de classe : créez-en une dans Groupes et classes pour préparer un parcours.',
        'Sie haben noch keine Klassen: Legen Sie unter Gruppen und Klassen eine an, um einen Pfad vorzubereiten.',
        'Du har inga klasser än: skapa en under Grupper och klasser för att förbereda en väg.',
    ],
    notebook: ['Taccuino del docente', 'Teacher notebook', 'Cuaderno del docente', 'Carnet de l’enseignant', 'Lehrkräfte-Notizbuch', 'Lärarens anteckningsbok'],
} satisfies Record<string, Localized>;

const names = {
    istituti: ['Istituti', 'Institutes', 'Institutos', 'Établissements', 'Einrichtungen', 'Lärosäten'],
    taccuino: labels.notebook,
    'taccuini-prova': ['Taccuini di prova', 'Practice notebooks', 'Cuadernos de práctica', 'Carnets d’entraînement', 'Übungs-Notizbücher', 'Övningsanteckningsböcker'],
    classi: ['Gruppi e classi', 'Groups and classes', 'Grupos y clases', 'Groupes et classes', 'Gruppen und Klassen', 'Grupper och klasser'],
    percorsi: ['Percorsi di classe', 'Class paths', 'Itinerarios de clase', 'Parcours de classe', 'Klassenpfade', 'Klassvägar'],
    assegnazioni: ['Assegnazioni', 'Assignments', 'Asignaciones', 'Attributions', 'Zuweisungen', 'Tilldelningar'],
    'catalogo-obiettivi': ['Catalogo obiettivi', 'Goal catalog', 'Catálogo de objetivos', 'Catalogue d’objectifs', 'Zielkatalog', 'Målkatalog'],
    strategie: ['Strategie', 'Strategies', 'Estrategias', 'Stratégies', 'Strategien', 'Strategier'],
    materiali: ['Letture, film e materiali', 'Readings, films and resources', 'Lecturas, películas y materiales', 'Lectures, films et ressources', 'Lektüren, Filme und Materialien', 'Läsningar, filmer och material'],
    orientamento: ['Orientamento dell’istituto', 'Institution guidance', 'Orientación de la institución', 'Orientation de l’établissement', 'Orientierung der Einrichtung', 'Institutionens vägledning'],
    somministrazioni: ['Piani di somministrazione', 'Administration plans', 'Planes de administración', 'Plans d’administration', 'Durchführungspläne', 'Administreringsplaner'],
} satisfies Record<TeacherAreaSlug, Localized>;

const descriptions = {
    istituti: ['Crea un istituto o scegli quello esistente e aderisci. Poi gestisci le tue classi.', 'Create an institute or select an existing one and join. Then manage your classes.', 'Crea un instituto o selecciona uno existente y únete. Después gestiona tus clases.', 'Créez un établissement ou choisissez-en un et rejoignez-le. Gérez ensuite vos classes.', 'Erstellen Sie eine Einrichtung oder wählen Sie eine bestehende und treten Sie bei. Verwalten Sie dann Ihre Klassen.', 'Skapa ett lärosäte eller välj ett befintligt och gå med. Hantera sedan dina klasser.'],
    'taccuini-prova': [
        'Crea studenti immaginari e usali nelle chat guidate per allenarti prima delle sessioni reali.',
        'Create imaginary students and use them in guided chats to practise before real sessions.',
        'Crea estudiantes imaginarios y úsalos en los chats guiados para practicar antes de las sesiones reales.',
        'Créez des étudiants imaginaires et utilisez-les dans les chats guidés pour vous entraîner avant les séances réelles.',
        'Erstellen Sie erfundene Lernende und nutzen Sie sie in begleiteten Chats, um vor echten Sitzungen zu üben.',
        'Skapa påhittade elever och använd dem i de vägledda chattarna för att öva före riktiga sessioner.',
    ],
    taccuino: [
        'Descrivi il tuo ruolo, la tua pratica abituale e i tuoi interessi di crescita.',
        'Describe your role, usual practice and development interests.',
        'Describe tu rol, tu práctica habitual y tus intereses de desarrollo.',
        'Décrivez votre rôle, votre pratique habituelle et vos intérêts de développement.',
        'Beschreiben Sie Ihre Rolle, Ihre übliche Praxis und Ihre Entwicklungsinteressen.',
        'Beskriv din roll, din vanliga undervisning och dina utvecklingsintressen.',
    ],
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
    percorsi: [
        'Prepara e pubblica la sequenza di passi che una classe percorre, e seguine l’avanzamento.',
        'Prepare and publish the sequence of steps a class walks through, and follow its progress.',
        'Prepara y publica la secuencia de pasos que recorre una clase y sigue su avance.',
        'Préparez et publiez la suite d’étapes qu’une classe parcourt, et suivez sa progression.',
        'Bereiten Sie die Schrittfolge vor, die eine Klasse durchläuft, veröffentlichen Sie sie und verfolgen Sie den Fortschritt.',
        'Förbered och publicera stegen som en klass går igenom och följ hur det går.',
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

const languageIndex = (lang: Lang) => Math.max(0, languages.indexOf(lang));
export const teacherAreaText = (lang: Lang, key: keyof typeof labels) => labels[key][languageIndex(lang)];
export const teacherAreaName = (lang: Lang, slug: TeacherAreaSlug) => names[slug][languageIndex(lang)];
export const teacherAreaDescription = (lang: Lang, slug: TeacherAreaSlug) => descriptions[slug][languageIndex(lang)];
