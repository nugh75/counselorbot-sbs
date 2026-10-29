// Consiglio orientativo: testi del tab docente (documento interno alla classe).
type Localized = readonly [string, string, string, string, string, string];

const texts = {
    title: ['Consiglio orientativo', 'Guidance recommendation', 'Consejo orientador', 'Recommandation d’orientation', 'Orientierungsempfehlung', 'Studievägledande rekommendation'],
    intro: [
        'Documento interno al consiglio di classe che presenta più possibilità scolastiche da esplorare, spiegando i percorsi e collegandoli ai punti di forza e agli interessi dello studente, senza indicare una scelta univoca. Se le informazioni sono insufficienti, lo dichiara e indica cosa approfondire. Redatto dai docenti ed esportabile in PDF; non è visibile allo studente né al link del consiglio di classe.',
        'An internal class-council document presenting several school pathways to explore, explaining them and linking them to the student’s strengths and interests without prescribing one choice. If the information is insufficient, it says so and identifies what to explore further. Written by teachers and exportable as PDF; it is not visible to the student or through the class-council link.',
        'Documento interno del consejo de clase que presenta varias opciones escolares para explorar, explica los itinerarios y los relaciona con los puntos fuertes y los intereses del estudiante, sin prescribir una única elección. Si la información es insuficiente, lo declara e indica qué profundizar. Redactado por los docentes y exportable en PDF; no es visible para el estudiante ni en el enlace del consejo de clase.',
        'Document interne au conseil de classe présentant plusieurs parcours scolaires à explorer, en les expliquant et en les reliant aux points forts et aux intérêts de l’élève, sans prescrire un choix unique. Si les informations sont insuffisantes, il le précise et indique les points à approfondir. Rédigé par les enseignants et exportable en PDF ; il n’est visible ni par l’élève ni dans le lien du conseil de classe.',
        'Internes Dokument der Klassenkonferenz, das mehrere schulische Möglichkeiten erläutert und mit den Stärken und Interessen der Lernenden verbindet, ohne eine einzige Wahl vorzugeben. Reichen die Informationen nicht aus, wird dies ausdrücklich genannt und weiterer Klärungsbedarf aufgezeigt. Von Lehrkräften verfasst und als PDF exportierbar; weder für Lernende noch über den Konferenz-Link sichtbar.',
        'Internt dokument för klasskonferensen som beskriver flera skolvägar att utforska och kopplar dem till elevens styrkor och intressen utan att föreskriva ett enda val. Om informationen är otillräcklig anges det tydligt, tillsammans med vad som behöver undersökas vidare. Skrivet av lärarna och kan exporteras som PDF; syns varken för eleven eller via konferenslänken.',
    ],
    privacy: [
        'La bozza usa i dati della classe e resta una proposta: entra nel documento solo quando la docenza la salva.',
        'The model-generated draft only works on the data already collected and remains a proposal: it enters the document only when the teachers save it.',
        'El borrador generado por el modelo trabaja solo con los datos ya recogidos y sigue siendo una propuesta: entra en el documento solo cuando lo guarda el profesorado.',
        'La trame générée par le modèle ne s’appuie que sur les données déjà recueillies et reste une proposition : elle entre dans le document seulement si les enseignants l’enregistrent.',
        'Der vom Modell erzeugte Entwurf arbeitet nur mit den bereits erfassten Daten und bleibt ein Vorschlag: Er gelangt ins Dokument, sobald die Lehrkraft ihn speichert.',
        'Utkastet som modellen genererar bygger bara på insamlade data och är ett förslag: det hamnar i dokumentet först när lärarna sparar det.',
    ],
    loading: ['Caricamento…', 'Loading…', 'Cargando…', 'Chargement…', 'Wird geladen…', 'Läser in…'],
    loadError: ['Elenco non caricato. Riprova.', 'The list did not load. Try again.', 'No se cargó la lista. Inténtalo de nuevo.', 'La liste n’a pas été chargée. Réessayez.', 'Die Liste wurde nicht geladen. Versuchen Sie es erneut.', 'Listan lästes inte in. Försök igen.'],
    reload: ['Riprova', 'Retry', 'Reintentar', 'Réessayer', 'Erneut versuchen', 'Försök igen'],
    noStudents: ['Nessuno studente iscritto alla classe.', 'No students in the class.', 'Ningún estudiante inscrito en la clase.', 'Aucun élève inscrit dans la classe.', 'Keine Lernenden in der Klasse.', 'Inga elever i klassen.'],
    search: ['Cerca studente', 'Search student', 'Buscar estudiante', 'Rechercher un élève', 'Lernende/n suchen', 'Sök elev'],
    noDocument: ['Nessun consiglio ancora', 'No recommendation yet', 'Aún sin consejo', 'Pas encore de recommandation', 'Noch keine Empfehlung', 'Ingen rekommendation än'],
    statusDraft: ['In lavorazione', 'Working copy', 'En proceso', 'En préparation', 'In Arbeit', 'Under arbete'],
    statusFinal: ['Documento chiuso', 'Closed document', 'Documento cerrado', 'Document clôturé', 'Abgeschlossenes Dokument', 'Avslutat dokument'],
    aiDrag: ['bozza AI riveduta', 'reviewed AI draft', 'borrador de IA revisado', 'proposition IA révisée', 'überarbeiteter KI-Entwurf', 'granskat AI-utkast'],
    selectHint: ['Scegli uno studente per scrivere o leggere il suo consiglio orientativo.', 'Choose a student to write or read their guidance recommendation.', 'Elige un estudiante para escribir o leer su consejo orientador.', 'Choisissez un élève pour rédiger ou lire sa recommandation d’orientation.', 'Wählen Sie eine/n Lernende/n, um die Orientierungsempfehlung zu schreiben oder zu lesen.', 'Välj en elev för att skriva eller läsa den studievägledande rekommendationen.'],
    discardChanges: ['Ci sono modifiche o una proposta non salvate. Cambiare studente e perderle?', 'There are unsaved changes or a draft. Change student and discard them?', 'Hay cambios o un borrador sin guardar. ¿Cambiar de estudiante y descartarlos?', 'Des modifications ou une proposition ne sont pas enregistrées. Changer d’élève et les abandonner ?', 'Es gibt ungespeicherte Änderungen oder einen Entwurf. Lernende wechseln und verwerfen?', 'Det finns osparade ändringar eller ett utkast. Byta elev och förkasta dem?'],
    historical: ['Studente non più iscritto: documento consultabile e scaricabile, ma non modificabile.', 'Former student: this document can be read and downloaded, but not edited.', 'Estudiante ya no inscrito: el documento se puede consultar y descargar, pero no modificar.', 'Ancien élève : le document peut être consulté et téléchargé, mais pas modifié.', 'Ehemalige Lernende: Das Dokument kann gelesen und heruntergeladen, aber nicht bearbeitet werden.', 'Tidigare elev: dokumentet kan läsas och laddas ned, men inte ändras.'],
    notFound: ['Documento non trovato. Riprova.', 'Document not found. Try again.', 'Documento no encontrado. Inténtalo de nuevo.', 'Document introuvable. Réessayez.', 'Dokument nicht gefunden. Versuchen Sie es erneut.', 'Dokumentet hittades inte. Försök igen.'],
    generate: ['Genera bozza', 'Generate draft', 'Generar borrador', 'Générer une trame', 'Entwurf erstellen', 'Skapa utkast'],
    generating: ['Generazione…', 'Generating…', 'Generando…', 'Génération…', 'Wird erstellt…', 'Skapar…'],
    generateError: ['Il modello non ha prodotto la bozza. Controlla la configurazione AI e riprova.', 'The model did not produce a draft. Check the AI settings and try again.', 'El modelo no produjo el borrador. Comprueba la configuración de IA e inténtalo de nuevo.', 'Le modèle n’a pas produit de trame. Vérifiez la configuration d’IA et réessayez.', 'Das Modell hat keinen Entwurf erzeugt. KI-Einstellungen prüfen und erneut versuchen.', 'Modellen gav inget utkast. Kontrollera AI-inställningarna och försök igen.'],
    generateConfirm: [
        'Il documento ha già un testo. Generare una bozza non lo sovrascrive: la proposta appare accanto e la sostituisci tu, se vuoi. Continuare?',
        'The document already has text. Generating a draft does not overwrite it: the proposal appears next to it and you replace it yourself, if you want it. Continue?',
        'El documento ya tiene texto. Generar un borrador no lo sobrescribe: la propuesta aparece al lado y las sustituyes tú si lo deseas. ¿Continuar?',
        'Le document contient déjà du texte. Générer une trame ne l’écrase pas : la proposition apparaît à côté et c’est vous qui la reprenez, si vous la souhaitez. Continuer ?',
        'Das Dokument hat bereits Text. Ein Entwurf überschreibt ihn nicht: der Vorschlag erscheint daneben und Sie übernehmen ihn bei Bedarf selbst. Fortfahren?',
        'Dokumentet har redan text. Att skapa ett utkast skriver inte över den: förslaget visas bredvid och du byter själv ut det om du vill. Fortsätta?',
    ],
    draftReady: ['Bozza proposta dal modello: rilegila e correggila. «Usa bozza» la copia nel documento, dove resta modificabile.', 'Model-proposed draft: reread it and correct it. “Use draft” copies it into the document, where it stays editable.', 'Borrador propuesto por el modelo: léalo y corríjalo. «Usar borrador» lo copia en el documento, donde sigue modificable.', 'Trame proposée par le modèle : relisez-la et corrigez-la. « Utiliser la trame » la copie dans le document, où elle reste modifiable.', 'Vom Modell vorgeschlagener Entwurf: Prüfen und korrigieren. «Entwurf übernehmen» kopiert ihn ins Dokument, wo er bearbeitbar bleibt.', 'Modellföreslaget utkast: läs om och korrigera. «Använd utkast» kopierar in det i dokumentet, där det förblir redigerbart.'],
    draftTitle: ['Proposta del modello', 'Model proposal', 'Propuesta del modelo', 'Proposition du modèle', 'Modellvorschlag', 'Modellförslag'],
    useIt: ['Usa bozza', 'Use draft', 'Usar borrador', 'Utiliser la trame', 'Entwurf übernehmen', 'Använd utkast'],
    discard: ['Ignora', 'Discard', 'Descartar', 'Ignorer', 'Verwerfen', 'Förkasta'],
    content: ['Testo del consiglio', 'Text of the recommendation', 'Texto del consejo', 'Texte de la recommandation', 'Text der Empfehlung', 'Text till rekommendationen'],
    contentPlaceholder: [
        'Descrivi più percorsi scolastici come possibilità da valutare o esplorare, collegando ciascuno ai punti di forza e agli interessi documentati dello studente. Non dare mai un indirizzo univoco. Se le informazioni sono insufficienti, dichiaralo e specifica cosa approfondire.',
        'Describe several school pathways as possibilities to consider or explore, linking each to the student’s documented strengths and interests. Never prescribe a single programme. If the information is insufficient, say so and specify what to explore further.',
        'Describa varios itinerarios escolares como posibilidades para valorar o explorar, relacionando cada uno con los puntos fuertes y los intereses documentados del estudiante. Nunca prescriba una única modalidad. Si la información es insuficiente, declárelo e indique qué profundizar.',
        'Décrivez plusieurs parcours scolaires comme des possibilités à envisager ou à explorer, en reliant chacun aux points forts et aux intérêts documentés de l’élève. Ne prescrivez jamais une seule filière. Si les informations sont insuffisantes, précisez-le et indiquez les points à approfondir.',
        'Beschreiben Sie mehrere schulische Wege als Möglichkeiten zum Abwägen oder Erkunden und verbinden Sie jeden mit den belegten Stärken und Interessen der Lernenden. Geben Sie niemals einen einzigen Bildungsgang vor. Reichen die Informationen nicht aus, benennen Sie dies und den Klärungsbedarf.',
        'Beskriv flera skolvägar som möjligheter att överväga eller utforska och koppla var och en till elevens dokumenterade styrkor och intressen. Föreskriv aldrig en enda inriktning. Om informationen är otillräcklig, säg det och ange vad som behöver undersökas vidare.',
    ],
    save: ['Salva', 'Save', 'Guardar', 'Enregistrer', 'Speichern', 'Spara'],
    saving: ['Salvataggio…', 'Saving…', 'Guardando…', 'Enregistrement…', 'Wird gespeichert…', 'Sparar…'],
    saved: ['Salvato', 'Saved', 'Guardado', 'Enregistré', 'Gespeichert', 'Sparat'],
    saveError: ['Documento non salvato. Riprova.', 'The document was not saved. Try again.', 'El documento no se guardó. Inténtalo de nuevo.', 'Le document n’a pas été enregistré. Réessayez.', 'Das Dokument wurde nicht gespeichert. Versuchen Sie es erneut.', 'Dokumentet sparades inte. Försök igen.'],
    conflictReload: ['Un’altra docente lo ha modificato. Ricarica per vedere il testo aggiornato.', 'Another teacher has changed this text. Reload to see its updated version.', 'Otro docente lo ha modificado. Recargue para ver el texto actualizado.', 'Un autre enseignant l’a modifié. Rechargez pour voir le texte à jour.', 'Eine andere Lehrkraft hat es geändert. Laden Sie neu, um den aktuellen Text zu sehen.', 'En annan lärare har ändrat den. Ladda om för att se uppdaterad text.'],
    detailLoadError: ['Documento non caricato. Riprova.', 'The document did not load. Try again.', 'No se cargó el documento. Inténtalo de nuevo.', 'Le document n’a pas été chargé. Réessayez.', 'Das Dokument wurde nicht geladen. Versuchen Sie es erneut.', 'Dokumentet lästes inte in. Försök igen.'],
    finalize: ['Segna come documento finale', 'Mark as final', 'Marcar como documento final', 'Marquer comme document final', 'Als endgültiges Dokument markieren', 'Markera som slutdokument'],
    finalizeConfirm: [
        'Rendi il consiglio orientativo documento finale del consiglio di classe? Resta modificabile: qui o in un’altra scheda.',
        'Make this guidance recommendation the final class-council document? It stays editable, here or in another tab.',
        '¿Hacer del consejo orientador el documento final del consejo de clase? Sigue modificable, aquí o en otra pestaña.',
        'Faire de cette recommandation d’orientation le document final du conseil de classe ? Elle reste modifiable, ici ou dans un autre onglet.',
        'Diese Orientierungsempfehlung als endgültiges Dokument der Klassenkonferenz markieren? Sie bleibt bearbeitbar, hier oder in einem anderen Tab.',
        'Gör den studievägledande rekommendationen till klasskonferensens slutdokument? Den förblir redigerbar, här eller i en annan flik.',
    ],
    backToDraft: ['Torna a bozza di lavoro', 'Back to working copy', 'Volver a borrador de trabajo', 'Revenir à la version de travail', 'Zurück zum Arbeitsexemplar', 'Tillbaka till arbetsversion'],
    download: ['Scarica PDF', 'Download PDF', 'Descargar PDF', 'Télécharger le PDF', 'PDF herunterladen', 'Ladda ned PDF'],
    downloadError: ['PDF non generato. Riprova.', 'The PDF was not generated. Try again.', 'No se generó el PDF. Inténtalo de nuevo.', 'Le PDF n’a pas été généré. Réessayez.', 'Das PDF wurde nicht erstellt. Versuchen Sie es erneut.', 'PDF-filen skapades inte. Försök igen.'],
    internalBadge: ['Documento interno al consiglio di classe', 'Internal to the class council', 'Interno del consejo de clase', 'Interne au conseil de classe', 'Intern der Klassenkonferenz', 'Internt för klasskonferensen'],
    classLabel: ['Classe', 'Class', 'Clase', 'Classe', 'Klasse', 'Klass'],
    studentLabel: ['Studente', 'Student', 'Estudiante', 'Élève', 'Lernende/r', 'Elev'],
    lastChange: ['Ultima modifica', 'Last change', 'Último cambio', 'Dernière modification', 'Letzte Änderung', 'Senaste ändring'],
} as const satisfies Record<string, Localized>;

export type OrientationRecTextKey = keyof typeof texts;

export function orientationRecText(lang: string, key: OrientationRecTextKey): string {
    const index = ['it', 'en', 'es', 'fr', 'de', 'sv'].indexOf(lang);
    return texts[key][index < 0 ? 1 : index];
}
