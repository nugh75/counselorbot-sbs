import type { Lang } from './i18n';

const languages: readonly Lang[] = ['it', 'en', 'es', 'fr', 'de', 'sv'];
type Localized = readonly [string, string, string, string, string, string];
const labels = {
    title: ['Compilazioni degli studenti', 'Student submissions', 'Resultados de los estudiantes', 'Résultats des élèves', 'Ergebnisse der Lernenden', 'Elevernas resultat'],
    description: ['Scegli una delle classi che gestisci, anche condivise, per consultare i risultati salvati dai partecipanti.', 'Choose a class you manage, including shared classes, to view participants’ saved results.', 'Elige una clase que gestionas, también compartida, para consultar los resultados guardados de los participantes.', 'Choisissez une classe que vous gérez, y compris partagée, pour consulter les résultats enregistrés des participants.', 'Wählen Sie eine von Ihnen verwaltete Klasse, auch eine geteilte, um die gespeicherten Ergebnisse der Teilnehmenden zu lesen.', 'Välj en klass du hanterar, även en delad klass, för att se deltagarnas sparade resultat.'],
    classLabel: ['Classe o gruppo', 'Class or group', 'Clase o grupo', 'Classe ou groupe', 'Klasse oder Gruppe', 'Klass eller grupp'],
    choose: ['Scegli una classe', 'Choose a class', 'Elige una clase', 'Choisissez une classe', 'Klasse auswählen', 'Välj en klass'],
    noClasses: ['Non hai classi o gruppi da gestire.', 'You have no classes or groups to manage.', 'No tienes clases ni grupos que gestionar.', 'Vous n’avez pas de classe ni de groupe à gérer.', 'Sie haben keine Klassen oder Gruppen zu verwalten.', 'Du har inga klasser eller grupper att hantera.'],
    empty: ['Nessuna compilazione visibile per questa classe.', 'No submissions are visible for this class.', 'No hay resultados visibles para esta clase.', 'Aucun résultat visible pour cette classe.', 'Für diese Klasse sind keine Ergebnisse sichtbar.', 'Inga resultat är synliga för den här klassen.'],
    classesError: ['Impossibile caricare le classi.', 'Unable to load classes.', 'No se pueden cargar las clases.', 'Impossible de charger les classes.', 'Die Klassen konnten nicht geladen werden.', 'Det gick inte att läsa in klasserna.'],
    resultsError: ['Impossibile caricare le compilazioni della classe.', 'Unable to load class submissions.', 'No se pueden cargar los resultados de la clase.', 'Impossible de charger les résultats de la classe.', 'Die Ergebnisse der Klasse konnten nicht geladen werden.', 'Det gick inte att läsa in klassens resultat.'],
    conversation: ['Conversazione', 'Conversation', 'Conversación', 'Conversation', 'Unterhaltung', 'Samtal'],
    conversationError: ['Impossibile caricare la conversazione.', 'Unable to load the conversation.', 'No se puede cargar la conversación.', 'Impossible de charger la conversation.', 'Die Unterhaltung konnte nicht geladen werden.', 'Det gick inte att läsa in samtalet.'],
    noConversation: ['Nessun messaggio disponibile per questa compilazione.', 'No messages are available for this submission.', 'No hay mensajes disponibles para este resultado.', 'Aucun message disponible pour ce résultat.', 'Für dieses Ergebnis sind keine Nachrichten verfügbar.', 'Inga meddelanden är tillgängliga för det här resultatet.'],
    student: ['Studente', 'Student', 'Estudiante', 'Élève', 'Lernende Person', 'Elev'],
    instrument: ['Strumento', 'Tool', 'Herramienta', 'Outil', 'Werkzeug', 'Verktyg'],
    date: ['Data', 'Date', 'Fecha', 'Date', 'Datum', 'Datum'],
} satisfies Record<string, Localized>;

export const classCompilationsText = (lang: Lang, key: keyof typeof labels) => labels[key][Math.max(0, languages.indexOf(lang))];
