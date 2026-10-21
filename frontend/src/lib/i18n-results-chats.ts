// Questionnaire analysis in operational plans: configuration before results exist (#249).
type Localized = readonly [string, string, string, string, string, string];
const texts = {
    analyzeQuestionnaire: ['Analizza un questionario', 'Analyze a questionnaire', 'Analizar un cuestionario', 'Analyser un questionnaire', 'Einen Fragebogen auswerten', 'Analysera en enkät'],
    personalResults: ['Da una compilazione personale', 'From a personal result', 'Desde un resultado personal', 'Depuis un résultat personnel', 'Aus einem persönlichen Ergebnis', 'Från ett personligt resultat'],
    personalResultsHelp: [
        'Ogni studente sceglie la propria compilazione all’avvio. Puoi preparare e pubblicare il piano anche prima che sia disponibile.',
        'Each student chooses their own result when starting. You can prepare and publish the plan before results are available.',
        'Cada estudiante elige su resultado al iniciar. Puedes preparar y publicar el plan antes de que haya resultados.',
        'Chaque élève choisit son résultat au démarrage. Vous pouvez préparer et publier le plan avant que les résultats soient disponibles.',
        'Lernende wählen beim Start ihr eigenes Ergebnis. Du kannst den Plan vorbereiten und veröffentlichen, bevor Ergebnisse vorliegen.',
        'Varje elev väljer sitt eget resultat vid start. Du kan förbereda och publicera planen innan resultaten finns.',
    ],
    planResultsHelp: [
        'Puoi collegare anche un questionario appena aggiunto o ancora da preparare. Il risultato serve quando lo studente avvia l’analisi.',
        'You can link a newly added questionnaire or one awaiting preparation. The result is needed when the student starts the analysis.',
        'Puedes vincular un cuestionario recién añadido o pendiente de preparar. El resultado se necesita cuando el estudiante inicia el análisis.',
        'Vous pouvez lier un questionnaire ajouté à l’instant ou restant à préparer. Le résultat est nécessaire lorsque l’élève démarre l’analyse.',
        'Auch neu hinzugefügte oder noch vorzubereitende Fragebögen lassen sich verknüpfen. Das Ergebnis wird beim Start der Auswertung benötigt.',
        'Du kan länka en nyss tillagd enkät eller en som väntar på förberedelse. Resultatet behövs när eleven startar analysen.',
    ],
    noQuestionnaireSteps: [
        'Aggiungi un passo questionario, oppure scegli una compilazione personale qui sotto.',
        'Add a questionnaire step, or choose a personal result below.',
        'Añade un paso de cuestionario o elige un resultado personal abajo.',
        'Ajoutez une étape questionnaire ou choisissez un résultat personnel ci-dessous.',
        'Füge einen Fragebogenschritt hinzu oder wähle unten ein persönliches Ergebnis.',
        'Lägg till ett enkätsteg eller välj ett personligt resultat nedan.',
    ],
    origin: ['Origine dei risultati', 'Results source', 'Origen de los resultados', 'Origine des résultats', 'Herkunft der Ergebnisse', 'Resultatens källa'],
    sourcePlan: ['Questionario del piano', 'Plan questionnaire', 'Cuestionario del plan', 'Questionnaire du plan', 'Fragebogen des Plans', 'Enkät i planen'],
    sourcePersonal: ['Compilazione personale', 'Personal result', 'Resultado personal', 'Résultat personnel', 'Persönliches Ergebnis', 'Personligt resultat'],
    chooseQuestionnaire: ['Scegli un questionario…', 'Choose a questionnaire…', 'Elige un cuestionario…', 'Choisir un questionnaire…', 'Fragebogen wählen…', 'Välj en enkät…'],
    chooseSourceStep: ['Scegli il passo questionario…', 'Choose the questionnaire step…', 'Elige el paso de cuestionario…', 'Choisir l’étape questionnaire…', 'Fragebogenschritt wählen…', 'Välj enkätsteget…'],
    chooseResult: ['Scegli la compilazione', 'Choose your result', 'Elige tu resultado', 'Choisis ton résultat', 'Wähle dein Ergebnis', 'Välj ditt resultat'],
    loading: ['Caricamento delle compilazioni…', 'Loading results…', 'Cargando resultados…', 'Chargement des résultats…', 'Ergebnisse werden geladen…', 'Laddar resultat…'],
    completeSource: ['Apri il passo questionario', 'Open the questionnaire step', 'Abrir el paso del cuestionario', 'Ouvrir l’étape questionnaire', 'Fragebogenschritt öffnen', 'Öppna enkätsteget'],
    addResult: ['Aggiungi una compilazione', 'Add a result', 'Añadir un resultado', 'Ajouter un résultat', 'Ergebnis hinzufügen', 'Lägg till ett resultat'],
    missingPersonal: [
        'Non hai ancora una compilazione valida di questo questionario. Aggiungila, poi torna qui per avviare l’analisi.',
        'You do not have a valid result for this questionnaire yet. Add one, then return here to start the analysis.',
        'Aún no tienes un resultado válido de este cuestionario. Añade uno y vuelve aquí para iniciar el análisis.',
        'Tu n’as pas encore de résultat valide pour ce questionnaire. Ajoutes-en un, puis reviens ici pour démarrer l’analyse.',
        'Du hast noch kein gültiges Ergebnis für diesen Fragebogen. Füge eines hinzu und kehre zur Auswertung hierher zurück.',
        'Du har inget giltigt resultat för den här enkäten ännu. Lägg till ett och kom sedan tillbaka för att starta analysen.',
    ],
    missingPlan: [
        'Per avviare l’analisi serve il risultato del passo questionario collegato. Apri quel passo e registra la compilazione.',
        'To start the analysis, you need the result from the linked questionnaire step. Open that step and record your result.',
        'Para iniciar el análisis necesitas el resultado del paso de cuestionario vinculado. Abre ese paso y registra tu resultado.',
        'Pour démarrer l’analyse, il faut le résultat de l’étape questionnaire liée. Ouvre cette étape et enregistre ton résultat.',
        'Für die Auswertung brauchst du das Ergebnis des verknüpften Fragebogenschritts. Öffne diesen Schritt und erfasse dein Ergebnis.',
        'För att starta analysen behöver du resultatet från det länkade enkätsteget. Öppna steget och registrera ditt resultat.',
    ],
    intro: [
        'La chat analizza il tuo risultato. Il passo si completa quando arrivi alla fine del percorso guidato; se esci, riprendi la stessa sessione e la stessa compilazione.',
        'The chat analyzes your result. The step is complete when you finish the guided path; if you leave, you resume the same session and result.',
        'El chat analiza tu resultado. El paso se completa al terminar el recorrido guiado; si sales, retomas la misma sesión y el mismo resultado.',
        'Le chat analyse ton résultat. L’étape se termine à la fin du parcours guidé ; si tu pars, tu reprends la même session et le même résultat.',
        'Der Chat wertet dein Ergebnis aus. Der Schritt ist am Ende des begleiteten Wegs abgeschlossen; beim Zurückkehren setzt du dieselbe Sitzung mit demselben Ergebnis fort.',
        'Chatten analyserar ditt resultat. Steget är klart när du avslutar det vägledda samtalet; om du lämnar fortsätter du med samma session och resultat.',
    ],
} satisfies Record<string, Localized>;
export type ResultsChatTextKey = keyof typeof texts;
export function resultsChatText(lang: string, key: ResultsChatTextKey): string {
    return texts[key][Math.max(0, ['it', 'en', 'es', 'fr', 'de', 'sv'].indexOf(lang))];
}
