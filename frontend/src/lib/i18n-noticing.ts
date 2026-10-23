// Teacher noticing panel (#247) beside the student's conversation.
type Localized = readonly [string, string, string, string, string, string];

const texts = {
    title: ['Quadro di noticing', 'Noticing overview', 'Cuadro de noticing', 'Tableau de noticing', 'Noticing-Übersicht', 'Noticing-översikt'],
    aiNote: [
        'Elementi proposti dall’IA a partire dalla conversazione: verificali sulle parole dello studente citate prima di riprenderli.',
        'Elements suggested by AI from the conversation: check them against the quoted student words before taking them up.',
        'Elementos propuestos por la IA a partir de la conversación: compruébalos con las palabras citadas del estudiante antes de retomarlos.',
        'Éléments proposés par l’IA à partir de la conversation : vérifiez-les sur les paroles citées de l’élève avant de les reprendre.',
        'Von der KI aus dem Gespräch vorgeschlagene Elemente: Prüfen Sie sie anhand der zitierten Worte der Lernenden, bevor Sie sie aufgreifen.',
        'Element som AI föreslår utifrån samtalet: kontrollera dem mot elevens citerade ord innan du tar upp dem.',
    ],
    revisit: ['Da riprendere', 'To take up', 'Para retomar', 'À reprendre', 'Aufgreifen', 'Att ta upp'],
    resource: ['Risorsa', 'Resource', 'Recurso', 'Ressource', 'Ressource', 'Resurs'],
    difficulty: ['Difficoltà', 'Difficulty', 'Dificultad', 'Difficulté', 'Schwierigkeit', 'Svårighet'],
    attention: ['Da attenzionare', 'Needs care', 'Requiere atención', 'À surveiller', 'Achtsam begleiten', 'Kräver omsorg'],
    studentWords: ['Parole dello studente', 'Student’s words', 'Palabras del estudiante', 'Paroles de l’élève', 'Worte der Lernenden', 'Elevens ord'],
    goToMessage: ['Vai al messaggio', 'Go to message', 'Ir al mensaje', 'Aller au message', 'Zur Nachricht', 'Gå till meddelandet'],
    generate: ['Genera il quadro', 'Generate the overview', 'Generar el cuadro', 'Générer le tableau', 'Übersicht erstellen', 'Skapa översikten'],
    regenerate: ['Aggiorna il quadro', 'Update the overview', 'Actualizar el cuadro', 'Mettre à jour le tableau', 'Übersicht aktualisieren', 'Uppdatera översikten'],
    generating: ['Generazione…', 'Generating…', 'Generando…', 'Génération…', 'Wird erstellt…', 'Skapar…'],
    generatedAt: ['Generato il', 'Generated on', 'Generado el', 'Généré le', 'Erstellt am', 'Skapad'],
    missing: [
        'Il quadro non è ancora stato generato per questa compilazione.',
        'The overview has not been generated for this compilation yet.',
        'El cuadro aún no se ha generado para esta cumplimentación.',
        'Le tableau n’a pas encore été généré pour cette passation.',
        'Die Übersicht wurde für diese Bearbeitung noch nicht erstellt.',
        'Översikten har ännu inte skapats för den här ifyllningen.',
    ],
    stale: [
        'La conversazione è cambiata dopo la generazione: aggiorna il quadro.',
        'The conversation changed after the overview was generated: update it.',
        'La conversación cambió después de generar el cuadro: actualízalo.',
        'La conversation a changé après la génération : mettez le tableau à jour.',
        'Das Gespräch hat sich nach der Erstellung geändert: Aktualisieren Sie die Übersicht.',
        'Samtalet har ändrats sedan översikten skapades: uppdatera den.',
    ],
    empty: [
        'Lo studente non ha scritto messaggi: non c’è nulla da sintetizzare.',
        'The student wrote no messages: there is nothing to summarise.',
        'El estudiante no escribió mensajes: no hay nada que sintetizar.',
        'L’élève n’a écrit aucun message : il n’y a rien à synthétiser.',
        'Die Lernenden haben keine Nachrichten geschrieben: Es gibt nichts zusammenzufassen.',
        'Eleven skrev inga meddelanden: det finns inget att sammanfatta.',
    ],
    unavailable: [
        'Il quadro non è stato generato. Riprova più tardi.',
        'The overview was not generated. Try again later.',
        'No se ha generado el cuadro. Inténtalo más tarde.',
        'Le tableau n’a pas été généré. Réessayez plus tard.',
        'Die Übersicht wurde nicht erstellt. Versuchen Sie es später erneut.',
        'Översikten skapades inte. Försök igen senare.',
    ],
    noItems: [
        'Nessun elemento è sostenuto da parole dello studente citate alla lettera.',
        'No element is supported by the student’s words quoted verbatim.',
        'Ningún elemento está respaldado por palabras del estudiante citadas literalmente.',
        'Aucun élément n’est étayé par des paroles de l’élève citées mot pour mot.',
        'Kein Element wird durch wörtlich zitierte Worte der Lernenden gestützt.',
        'Inget element stöds av elevens ord citerade ordagrant.',
    ],
    loadError: ['Il quadro non è stato caricato.', 'The overview could not be loaded.', 'No se ha podido cargar el cuadro.', 'Le tableau n’a pas pu être chargé.', 'Die Übersicht konnte nicht geladen werden.', 'Översikten kunde inte laddas.'],
} as const satisfies Record<string, Localized>;

export type NoticingTextKey = keyof typeof texts;

export function noticingText(lang: string, key: NoticingTextKey): string {
    const index = ['it', 'en', 'es', 'fr', 'de', 'sv'].indexOf(lang);
    return texts[key][index < 0 ? 1 : index];
}
