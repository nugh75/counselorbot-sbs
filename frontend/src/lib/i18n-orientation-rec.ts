// Consiglio orientativo: testi del tab docente (documento interno alla classe).
type Localized = readonly [string, string, string, string, string, string];

const texts = {
    title: ['Consiglio orientativo', 'Guidance recommendation', 'Consejo orientador', 'Recommandation d’orientation', 'Orientierungsempfehlung', 'Studievägledande rekommendation'],
    intro: [
        'Documento interno al consiglio di classe: una valutazione per studente redatta dai docenti ed esportabile in PDF. Non è visibile allo studente né al link del consiglio di classe.',
        'An internal class-council document: one evaluation per student, written by the teachers and exportable as PDF. It is never visible to the student nor through the class-council link.',
        'Documento interno del consejo de clase: una valoración por estudiante redactada por los docentes y exportable en PDF. No es visible para el estudiante ni en el enlace del consejo de clase.',
        'Document interne au conseil de classe : une évaluation par élève rédigée par les enseignants et exportable en PDF. Elle n’est pas visible par l’élève ni dans le lien du conseil de classe.',
        'Internes Dokument der Klassenkonferenz: eine Beurteilung pro Lernender, von der Lehrkraft verfasst und als PDF exportierbar. Es ist nicht für die Lernenden sichtbar und nicht über den Konferenz-Link zugänglich.',
        'Internt dokument för klasskonferensen: en bedömning per elev, skriven av lärarna och exportbar som PDF. Den syns aldrig för eleven eller via konferenslänken.',
    ],
    privacy: [
        'La bozza generata dal modello parla dei dati raccolti nel pianale e resta una proposta: entra nel documento solo quando la docenza la salva.',
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
        'Scrivi le valutazioni del consiglio di classe per questo studente: attitudini, scioglimento corretto dei metodi di studio, situazioni puntuali e orientamento per il prossimo anno.',
        'Write the class council’s evaluation for this student: attitudes, strengths and growth areas, concrete notes and the orientation for next year.',
        'Escriba la valoración del consejo de clase para este estudiante: actitudes, puntos fuertes y de crecimiento, notas concretas y orientación para el próximo año.',
        'Rédigez l’évaluation du conseil de classe pour cet élève : attitudes, points forts et à consolider, notes concrètes et orientation pour l’année suivante.',
        'Schreiben Sie die Beurteilung der Klassenkonferenz für diese/n Lernende/n: Einstellungen, Stärken und Lernbereiche, konkrete Hinweise und Orientierung für das nächste Jahr.',
        'Skriv klasskonferensens bedömning för eleven: attityder, styrkor och utvecklingsområden, konkreta noteringar och vägledning för nästa år.',
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
