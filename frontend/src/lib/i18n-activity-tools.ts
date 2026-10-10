// #174: texts of the tools an activity asks the student to use.
type Localized = readonly [string, string, string, string, string, string];

const texts = {
    tools: ['Strumenti da usare nell’attività', 'Tools to use in the activity', 'Herramientas para usar en la actividad', 'Outils à utiliser dans l’activité', 'Werkzeuge für die Aktivität', 'Verktyg att använda i aktiviteten'],
    toolsHelp: [
        'Lo studente li apre dentro l’attività, in una finestra, o a pagina intera. Solo strumenti personali abilitati per la classe o il gruppo.',
        'The student opens them inside the activity, in a window, or at full page. Only personal tools enabled for the class or group.',
        'El estudiante las abre dentro de la actividad, en una ventana, o a página completa. Solo herramientas personales habilitadas para la clase o el grupo.',
        'L’élève les ouvre dans l’activité, dans une fenêtre, ou en pleine page. Seulement les outils personnels activés pour la classe ou le groupe.',
        'Die lernende Person öffnet sie in der Aktivität, in einem Fenster, oder als ganze Seite. Nur persönliche Werkzeuge, die für die Klasse oder Gruppe aktiviert sind.',
        'Eleven öppnar dem i aktiviteten, i ett fönster, eller som hel sida. Bara personliga verktyg som är aktiverade för klassen eller gruppen.',
    ],
    noTools: [
        'Nessuno strumento personale è abilitato per questa classe o gruppo.',
        'No personal tool is enabled for this class or group.',
        'Ninguna herramienta personal está habilitada para esta clase o grupo.',
        'Aucun outil personnel n’est activé pour cette classe ou ce groupe.',
        'Für diese Klasse oder Gruppe ist kein persönliches Werkzeug aktiviert.',
        'Inget personligt verktyg är aktiverat för den här klassen eller gruppen.',
    ],
    chooseGroupFirst: ['Scegli prima la classe o il gruppo.', 'Choose the class or group first.', 'Elige primero la clase o el grupo.', 'Choisissez d’abord la classe ou le groupe.', 'Wähle zuerst die Klasse oder Gruppe.', 'Välj först klassen eller gruppen.'],
    openHere: ['Apri qui', 'Open here', 'Abrir aquí', 'Ouvrir ici', 'Hier öffnen', 'Öppna här'],
    openFullPage: ['Apri a pagina intera', 'Open full page', 'Abrir a página completa', 'Ouvrir en pleine page', 'Als ganze Seite öffnen', 'Öppna som hel sida'],
    unavailable: [
        'Non disponibile: lo strumento è stato disattivato per la classe o il gruppo.',
        'Not available: the tool was switched off for the class or group.',
        'No disponible: la herramienta se desactivó para la clase o el grupo.',
        'Indisponible : l’outil a été désactivé pour la classe ou le groupe.',
        'Nicht verfügbar: Das Werkzeug wurde für die Klasse oder Gruppe ausgeschaltet.',
        'Inte tillgängligt: verktyget har stängts av för klassen eller gruppen.',
    ],
    close: ['Chiudi e torna all’attività', 'Close and return to the activity', 'Cerrar y volver a la actividad', 'Fermer et revenir à l’activité', 'Schließen und zur Aktivität zurück', 'Stäng och gå tillbaka till aktiviteten'],
} satisfies Record<string, Localized>;

export type ActivityToolTextKey = keyof typeof texts;
const languages = ['it', 'en', 'es', 'fr', 'de', 'sv'];

export function activityToolText(lang: string, key: ActivityToolTextKey): string {
    return texts[key][Math.max(0, languages.indexOf(lang))];
}
