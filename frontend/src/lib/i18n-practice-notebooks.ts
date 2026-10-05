import type { Lang } from './i18n';

// Testi della pagina /docente/taccuini-prova (stessa grammatica di
// i18n-teacher-area.ts). Le etichette dei campi riusano lp.field.* del
// taccuino studente.
type Localized = readonly [string, string, string, string, string, string];
const languages: readonly Lang[] = ['it', 'en', 'es', 'fr', 'de', 'sv'];

const texts = {
    note: [
        'Ogni taccuino descrive uno studente immaginario. Nelle Opzioni di una chat guidata o della Bussola scegli «Prova» e il taccuino: la conversazione usa lo studente simulato al posto dei tuoi dati e il modello riceve un’istruzione esplicita che si tratta di una simulazione per il tuo allenamento. Non inserire dati di studenti reali.',
        'Each notebook describes an imaginary student. In the Options of a guided chat or the Compass, choose “Practice” and the notebook: the conversation uses the simulated student instead of your data, and the model receives an explicit instruction that it is a simulation for your practice. Do not enter real students’ data.',
        'Cada cuaderno describe a un estudiante imaginario. En las Opciones de un chat guiado o de la Brújula elige «Práctica» y el cuaderno: la conversación usa al estudiante simulado en lugar de tus datos y el modelo recibe una instrucción explícita de que es una simulación para tu práctica. No introduzcas datos de estudiantes reales.',
        'Chaque carnet décrit un étudiant imaginaire. Dans les Options d’un chat guidé ou de la Boussole, choisissez « Entraînement » puis le carnet : la conversation utilise l’étudiant simulé à la place de vos données et le modèle reçoit une instruction explicite indiquant qu’il s’agit d’une simulation pour votre entraînement. N’indiquez pas de données d’étudiants réels.',
        'Jedes Notizbuch beschreibt eine erfundene lernende Person. Wählen Sie in den Optionen eines begleiteten Chats oder des Kompasses „Übung“ und das Notizbuch: Das Gespräch nutzt die simulierte Person statt Ihrer Daten, und das Modell erhält die ausdrückliche Anweisung, dass es sich um eine Simulation zu Ihrer Übung handelt. Geben Sie keine Daten echter Lernender ein.',
        'Varje anteckningsbok beskriver en påhittad elev. Välj ”Övning” och anteckningsboken i Alternativ i en vägledd chatt eller i kompassen: samtalet använder den simulerade eleven i stället för dina uppgifter, och modellen får en uttrycklig instruktion om att det är en simulering för din övning. Ange inte uppgifter om riktiga elever.',
    ],
    create: ['Nuovo taccuino di prova', 'New practice notebook', 'Nuevo cuaderno de práctica', 'Nouveau carnet d’entraînement', 'Neues Übungs-Notizbuch', 'Ny övningsanteckningsbok'],
    name: ['Nome dello studente immaginario', 'Imaginary student’s name', 'Nombre del estudiante imaginario', 'Nom de l’étudiant imaginaire', 'Name der erfundenen Person', 'Den påhittade elevens namn'],
    nameHint: [
        'Un nome o una sigla che ti aiuti a riconoscerlo, ad esempio «Giulia, 3ª liceo».',
        'A name or label that helps you recognise them, for example “Giulia, year 11”.',
        'Un nombre o una etiqueta que te ayude a reconocerlo, por ejemplo «Giulia, 1.º de bachillerato».',
        'Un nom ou un repère pour le reconnaître, par exemple « Giulia, première ».',
        'Ein Name oder Kürzel zum Wiedererkennen, zum Beispiel „Giulia, 11. Klasse“.',
        'Ett namn eller en etikett som hjälper dig att känna igen eleven, till exempel ”Giulia, år 2 gymnasiet”.',
    ],
    save: ['Salva', 'Save', 'Guardar', 'Enregistrer', 'Speichern', 'Spara'],
    cancel: ['Annulla', 'Cancel', 'Cancelar', 'Annuler', 'Abbrechen', 'Avbryt'],
    edit: ['Modifica', 'Edit', 'Editar', 'Modifier', 'Bearbeiten', 'Redigera'],
    archive: ['Archivia', 'Archive', 'Archivar', 'Archiver', 'Archivieren', 'Arkivera'],
    restore: ['Ripristina', 'Restore', 'Restaurar', 'Restaurer', 'Wiederherstellen', 'Återställ'],
    remove: ['Elimina', 'Delete', 'Eliminar', 'Supprimer', 'Löschen', 'Radera'],
    confirmRemove: [
        'Eliminare definitivamente questo taccuino di prova?',
        'Permanently delete this practice notebook?',
        '¿Eliminar definitivamente este cuaderno de práctica?',
        'Supprimer définitivement ce carnet d’entraînement ?',
        'Dieses Übungs-Notizbuch endgültig löschen?',
        'Radera den här övningsanteckningsboken permanent?',
    ],
    archived: ['Archiviati', 'Archived', 'Archivados', 'Archivés', 'Archiviert', 'Arkiverade'],
    empty: [
        'Non hai ancora taccuini di prova.',
        'You have no practice notebooks yet.',
        'Todavía no tienes cuadernos de práctica.',
        'Vous n’avez pas encore de carnet d’entraînement.',
        'Sie haben noch keine Übungs-Notizbücher.',
        'Du har inga övningsanteckningsböcker ännu.',
    ],
    noFields: ['Nessun campo compilato.', 'No fields filled in.', 'Ningún campo completado.', 'Aucun champ rempli.', 'Keine Felder ausgefüllt.', 'Inga fält ifyllda.'],
    error: [
        'Operazione non riuscita. Riprova.',
        'The operation failed. Try again.',
        'La operación no se ha completado. Inténtalo de nuevo.',
        'L’opération a échoué. Réessayez.',
        'Der Vorgang ist fehlgeschlagen. Bitte erneut versuchen.',
        'Åtgärden misslyckades. Försök igen.',
    ],
    loadError: [
        'Impossibile caricare i taccuini di prova.',
        'Could not load the practice notebooks.',
        'No se pudieron cargar los cuadernos de práctica.',
        'Impossible de charger les carnets d’entraînement.',
        'Die Übungs-Notizbücher konnten nicht geladen werden.',
        'Det gick inte att läsa in övningsanteckningsböckerna.',
    ],
    retry: ['Riprova', 'Try again', 'Reintentar', 'Réessayer', 'Erneut versuchen', 'Försök igen'],
    classes: ['Classi dello studente', 'Student’s classes', 'Clases del estudiante', 'Classes de l’étudiant', 'Klassen der lernenden Person', 'Elevens klasser'],
    classesHint: [
        'Come per uno studente iscritto: nella chat entra il contesto delle classi in cui hai attivato la condivisione con gli studenti. Idea e Bussola non lo ricevono.',
        'As for an enrolled student: the chat receives the context of the classes where you turned on sharing with students. Idea and the Compass do not receive it.',
        'Como para un estudiante inscrito: el chat recibe el contexto de las clases en las que activaste el uso compartido con los estudiantes. Idea y la Brújula no lo reciben.',
        'Comme pour un étudiant inscrit : le chat reçoit le contexte des classes où vous avez activé le partage avec les étudiants. Idée et la Boussole ne le reçoivent pas.',
        'Wie bei eingeschriebenen Lernenden: Der Chat erhält den Kontext der Klassen, in denen Sie das Teilen mit Lernenden aktiviert haben. Idee und der Kompass erhalten ihn nicht.',
        'Som för en inskriven elev: chatten får kontexten för de klasser där du har aktiverat delning med eleverna. Idé och kompassen får den inte.',
    ],
    notShared: [
        'contesto non condiviso con gli studenti: non entra nella chat',
        'context not shared with students: it does not enter the chat',
        'contexto no compartido con los estudiantes: no entra en el chat',
        'contexte non partagé avec les étudiants : il n’entre pas dans le chat',
        'Kontext nicht mit Lernenden geteilt: gelangt nicht in den Chat',
        'kontexten delas inte med eleverna: den kommer inte in i chatten',
    ],
    noClasses: [
        'Non gestisci ancora classi.',
        'You do not manage any classes yet.',
        'Todavía no gestionas clases.',
        'Vous ne gérez encore aucune classe.',
        'Sie verwalten noch keine Klassen.',
        'Du hanterar inga klasser ännu.',
    ],
    classesError: [
        'Impossibile caricare le classi: quelle già associate restano salvate.',
        'Could not load the classes: those already linked stay saved.',
        'No se pudieron cargar las clases: las ya asociadas siguen guardadas.',
        'Impossible de charger les classes : celles déjà associées restent enregistrées.',
        'Die Klassen konnten nicht geladen werden: bereits verknüpfte bleiben gespeichert.',
        'Det gick inte att läsa in klasserna: de som redan är kopplade sparas.',
    ],
    manageClasses: ['Gestisci gruppi e classi', 'Manage groups and classes', 'Gestionar grupos y clases', 'Gérer groupes et classes', 'Gruppen und Klassen verwalten', 'Hantera grupper och klasser'],
    saved: ['Salvato', 'Saved', 'Guardado', 'Enregistré', 'Gespeichert', 'Sparat'],
} satisfies Record<string, Localized>;

export type PracticeNotebookTextKey = keyof typeof texts;
export const practiceNotebookText = (lang: Lang, key: PracticeNotebookTextKey) => texts[key][Math.max(0, languages.indexOf(lang))];
