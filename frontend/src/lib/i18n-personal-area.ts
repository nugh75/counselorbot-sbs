import type { Lang } from './i18n';
import type { PersonalAreaSlug } from './personal-area';

type Localized = readonly [string, string, string, string, string, string];
const languages: readonly Lang[] = ['it', 'en', 'es', 'fr', 'de', 'sv'];
const labels = {
    title: ['Area personale', 'Personal area', 'Área personal', 'Espace personnel', 'Persönlicher Bereich', 'Personlig sida'],
    intro: ['Ritrova il tuo lavoro e scegli come proseguire.', 'Find your work and choose how to continue.', 'Encuentra tu trabajo y elige cómo continuar.', 'Retrouve ton travail et choisis comment continuer.', 'Finde deine Arbeit wieder und entscheide, wie es weitergeht.', 'Hitta ditt arbete och välj hur du vill fortsätta.'],
    journey: ['Il mio percorso', 'My journey', 'Mi recorrido', 'Mon parcours', 'Mein Weg', 'Min väg'],
    reflection: ['Conoscermi e riflettere', 'Understand myself and reflect', 'Conocerme y reflexionar', 'Me connaître et réfléchir', 'Mich kennenlernen und reflektieren', 'Lära känna mig själv och reflektera'],
    study: ['Studiare e ragionare', 'Study and think', 'Estudiar y razonar', 'Étudier et raisonner', 'Lernen und nachdenken', 'Studera och resonera'],
    works: ['I miei lavori', 'My work', 'Mis trabajos', 'Mes travaux', 'Meine Arbeiten', 'Mina arbeten'],
    support: ['Persone e supporto', 'People and support', 'Personas y apoyo', 'Personnes et accompagnement', 'Menschen und Unterstützung', 'Personer och stöd'],
    resume: ['Da riprendere', 'Continue your work', 'Para continuar', 'À reprendre', 'Weiterarbeiten', 'Fortsätt arbeta'],
    error: ['Non riesco a caricare il riepilogo.', 'The overview could not be loaded.', 'No se ha podido cargar el resumen.', 'Le récapitulatif n’a pas pu être chargé.', 'Die Übersicht konnte nicht geladen werden.', 'Översikten kunde inte laddas.'],
    stale: ['I dati mostrati potrebbero non essere aggiornati.', 'The information shown may be out of date.', 'Los datos mostrados podrían no estar actualizados.', 'Les informations affichées peuvent ne pas être à jour.', 'Die angezeigten Daten sind möglicherweise nicht aktuell.', 'Uppgifterna som visas kan vara inaktuella.'],
    retry: ['Riprova', 'Try again', 'Reintentar', 'Réessayer', 'Erneut versuchen', 'Försök igen'],
    loading: ['Caricamento del riepilogo…', 'Loading overview…', 'Cargando el resumen…', 'Chargement du récapitulatif…', 'Übersicht wird geladen…', 'Laddar översikten…'],
    goal: ['Obiettivo', 'Goal', 'Objetivo', 'Objectif', 'Ziel', 'Mål'],
    action: ['Attività', 'Activity', 'Actividad', 'Activité', 'Aktivität', 'Aktivitet'],
    assignment: ['Assegnazione', 'Assignment', 'Actividad asignada', 'Activité proposée', 'Aufgabe', 'Tilldelad uppgift'],
    feedback: ['Feedback disponibile', 'Feedback available', 'Comentarios disponibles', 'Retour disponible', 'Feedback verfügbar', 'Återkoppling finns'],
} satisfies Record<string, Localized>;

const names = {
    obiettivi: ['Obiettivi', 'Goals', 'Objetivos', 'Objectifs', 'Ziele', 'Mål'],
    azioni: ['Azioni', 'Actions', 'Acciones', 'Actions', 'Aktionen', 'Åtgärder'],
    timeline: ['Linea del tempo', 'Timeline', 'Línea del tiempo', 'Ligne du temps', 'Zeitleiste', 'Tidslinje'],
    taccuino: ['Taccuino', 'Notebook', 'Cuaderno', 'Carnet', 'Notizbuch', 'Anteckningsbok'],
    libretto: ['Libretto', 'Booklet', 'Cuadernillo', 'Livret', 'Arbeitsheft', 'Arbetshäfte'],
    cambiamenti: ['Cambiamenti', 'Changes', 'Cambios', 'Changements', 'Veränderungen', 'Förändringar'],
    compilazioni: ['Risultati e conversazioni', 'Results and conversations', 'Resultados y conversaciones', 'Résultats et conversations', 'Ergebnisse und Gespräche', 'Resultat och samtal'],
    pqbl: ['Studiare da un PDF', 'Study from a PDF', 'Estudiar con un PDF', 'Étudier à partir d’un PDF', 'Mit einem PDF lernen', 'Studera med en PDF'],
    flashcard: ['Flashcard', 'Flashcards', 'Tarjetas didácticas', 'Cartes de révision', 'Karteikarten', 'Flashkort'],
    carte: ['Carte da ordinare', 'Cards to sort', 'Tarjetas para ordenar', 'Cartes à classer', 'Karten sortieren', 'Kort att sortera'],
    confronto: ['Confrontare alternative', 'Compare alternatives', 'Comparar alternativas', 'Comparer des possibilités', 'Alternativen vergleichen', 'Jämföra alternativ'],
    tavolo: ['Tavolo', 'Tavolo', 'Tavolo', 'Tavolo', 'Tavolo', 'Tavolo'],
    portfolio: ['Portfolio', 'Portfolio', 'Portafolio', 'Portfolio', 'Portfolio', 'Portfolio'],
    assegnazioni: ['Assegnazioni', 'Assignments', 'Actividades asignadas', 'Activités proposées', 'Aufgaben', 'Tilldelade uppgifter'],
    classi: ['Gruppi e classi', 'Groups and classes', 'Grupos y clases', 'Groupes et classes', 'Gruppen und Klassen', 'Grupper och klasser'],
    orientamento: ['Orientamento', 'Guidance', 'Orientación', 'Orientation', 'Orientierung', 'Vägledning'],
    telegram: ['Telegram', 'Telegram', 'Telegram', 'Telegram', 'Telegram', 'Telegram'],
} satisfies Record<PersonalAreaSlug, Localized>;

const descriptions = {
    obiettivi: ['Scegli che cosa vuoi raggiungere e il prossimo passo.', 'Choose what you want to achieve and your next step.', 'Elige qué quieres alcanzar y tu próximo paso.', 'Choisis ce que tu veux atteindre et ta prochaine étape.', 'Wähle, was du erreichen möchtest und deinen nächsten Schritt.', 'Välj vad du vill uppnå och ditt nästa steg.'],
    azioni: ['Organizza quello che vuoi fare, stai facendo o hai provato.', 'Organize what you want to do, are doing or have tried.', 'Organiza lo que quieres hacer, estás haciendo o has probado.', 'Organise ce que tu veux faire, fais ou as essayé.', 'Ordne, was du tun möchtest, gerade tust oder ausprobiert hast.', 'Ordna det du vill göra, gör eller har provat.'],
    timeline: ['Guarda nel tempo tappe, attività, obiettivi e appuntamenti.', 'See milestones, activities, goals and appointments over time.', 'Mira en el tiempo etapas, actividades, objetivos y citas.', 'Regarde dans le temps tes étapes, tes activités, tes objectifs et tes rendez-vous.', 'Siehe Etappen, Aktivitäten, Ziele und Termine im Zeitverlauf.', 'Se etapper, aktiviteter, mål och tider över tid.'],
    taccuino: ['Racconta il tuo contesto, gli interessi e il modo di apprendere.', 'Describe your context, interests and way of learning.', 'Describe tu contexto, tus intereses y tu forma de aprender.', 'Décris ton contexte, tes intérêts et ta façon d’apprendre.', 'Beschreibe deinen Hintergrund, deine Interessen und deine Art zu lernen.', 'Beskriv din situation, dina intressen och hur du lär dig.'],
    libretto: ['Prepara una prova e rifletti su come è andata.', 'Prepare something to try and reflect on how it went.', 'Prepara algo para probar y reflexiona sobre cómo fue.', 'Prépare une mise en pratique et réfléchis à son déroulement.', 'Bereite etwas zum Ausprobieren vor und reflektiere, wie es lief.', 'Förbered något att prova och reflektera över hur det gick.'],
    cambiamenti: ['Confronta ciò che hai scritto e rifletti sui cambiamenti.', 'Compare what you have written and reflect on changes.', 'Compara lo que has escrito y reflexiona sobre los cambios.', 'Compare ce que tu as écrit et réfléchis aux changements.', 'Vergleiche deine Texte und reflektiere über Veränderungen.', 'Jämför det du har skrivit och reflektera över förändringar.'],
    compilazioni: ['Ritrova i risultati dei questionari e i dialoghi collegati.', 'Find your questionnaire results and related conversations.', 'Encuentra los resultados de tus cuestionarios y los diálogos relacionados.', 'Retrouve les résultats des questionnaires et les échanges associés.', 'Finde Fragebogenergebnisse und die zugehörigen Gespräche wieder.', 'Hitta enkätresultat och tillhörande samtal.'],
    pqbl: ['Lavora sul tuo materiale attraverso domande e feedback.', 'Work with your material through questions and feedback.', 'Trabaja con tu material mediante preguntas y comentarios.', 'Travaille sur ton document avec des questions et des retours.', 'Bearbeite dein Material anhand von Fragen und Feedback.', 'Arbeta med ditt material genom frågor och återkoppling.'],
    flashcard: ['Memorizza e ripassa con carte domanda e risposta.', 'Memorize and review with question and answer cards.', 'Memoriza y repasa con tarjetas de preguntas y respuestas.', 'Mémorise et révise avec des cartes de questions et réponses.', 'Lerne und wiederhole mit Frage-und-Antwort-Karten.', 'Lär dig och repetera med fråge- och svarskort.'],
    carte: ['Raggruppa idee e riflessioni.', 'Group ideas and reflections.', 'Agrupa ideas y reflexiones.', 'Regroupe des idées et des réflexions.', 'Gruppiere Ideen und Gedanken.', 'Gruppera idéer och reflektioner.'],
    confronto: ['Valuta possibilità diverse secondo i tuoi criteri.', 'Weigh different possibilities using your own criteria.', 'Valora distintas posibilidades según tus criterios.', 'Évalue différentes possibilités selon tes critères.', 'Bewerte verschiedene Möglichkeiten nach deinen Kriterien.', 'Bedöm olika möjligheter utifrån dina kriterier.'],
    tavolo: ['Costruisci e rivedi diagrammi di lavoro.', 'Build and revise working diagrams.', 'Construye y revisa diagramas de trabajo.', 'Construis et révise des diagrammes de travail.', 'Erstelle und überarbeite Arbeitsdiagramme.', 'Skapa och revidera arbetsdiagram.'],
    portfolio: ['Conserva e ritrova i tuoi lavori.', 'Keep and find your work.', 'Guarda y encuentra tus trabajos.', 'Conserve et retrouve tes travaux.', 'Bewahre deine Arbeiten auf und finde sie wieder.', 'Spara och hitta dina arbeten.'],
    assegnazioni: ['Ritrova le attività dei docenti, prepara le restituzioni e leggi i feedback.', 'Find teacher assignments, prepare responses and read feedback.', 'Encuentra las actividades del profesorado, prepara tus entregas y lee los comentarios.', 'Retrouve les activités des enseignants, prépare tes réponses et lis leurs retours.', 'Finde Aufgaben deiner Lehrkräfte, bereite Abgaben vor und lies Feedback.', 'Hitta lärarnas uppgifter, förbered inlämningar och läs återkoppling.'],
    classi: ['Gestisci le iscrizioni e leggi i messaggi dei docenti.', 'Manage memberships and read messages from teachers.', 'Gestiona tus inscripciones y lee los mensajes del profesorado.', 'Gère tes inscriptions et lis les messages des enseignants.', 'Verwalte deine Mitgliedschaften und lies Nachrichten der Lehrkräfte.', 'Hantera medlemskap och läs lärarnas meddelanden.'],
    orientamento: ['Trova contatti e appuntamenti del tuo istituto.', 'Find contacts and appointments at your institution.', 'Encuentra contactos y citas de tu institución.', 'Trouve des contacts et des rendez-vous dans ton établissement.', 'Finde Kontakte und Termine deiner Einrichtung.', 'Hitta kontakter och mötestider vid din institution.'],
    telegram: ['Collega il tuo account per usare anche questo canale.', 'Link your account to use this channel too.', 'Vincula tu cuenta para usar también este canal.', 'Associe ton compte pour utiliser aussi ce canal.', 'Verknüpfe dein Konto, um auch diesen Kanal zu nutzen.', 'Länka ditt konto för att även använda denna kanal.'],
} satisfies Record<PersonalAreaSlug, Localized>;

const languageIndex = (lang: Lang) => Math.max(0, languages.indexOf(lang));
export const personalAreaText = (lang: Lang, key: keyof typeof labels) => labels[key][languageIndex(lang)];
export const personalAreaName = (lang: Lang, slug: PersonalAreaSlug) => names[slug][languageIndex(lang)];
export const personalAreaDescription = (lang: Lang, slug: PersonalAreaSlug) => descriptions[slug][languageIndex(lang)];
