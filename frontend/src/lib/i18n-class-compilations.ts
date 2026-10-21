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
    detail: ['Apri compilazione', 'Open submission', 'Abrir resultado', 'Ouvrir le résultat', 'Ergebnis öffnen', 'Öppna resultat'],
    detailError: ['Impossibile caricare il dettaglio della compilazione.', 'Unable to load submission details.', 'No se puede cargar el detalle del resultado.', 'Impossible de charger le détail du résultat.', 'Die Ergebnisdetails konnten nicht geladen werden.', 'Det gick inte att läsa in resultatets detaljer.'],
    studentReading: ['La mia lettura — riflessione dello studente', 'My reading — student reflection', 'Mi lectura — reflexión del estudiante', 'Ma lecture — réflexion de l’élève', 'Meine Deutung — Reflexion der lernenden Person', 'Min tolkning — elevens reflektion'],
    noReading: ['Lo studente non ha ancora salvato una riflessione su questa compilazione.', 'The student has not saved a reflection on this submission yet.', 'El estudiante aún no ha guardado una reflexión sobre este resultado.', 'L’élève n’a pas encore enregistré de réflexion sur ce résultat.', 'Die lernende Person hat noch keine Reflexion zu diesem Ergebnis gespeichert.', 'Eleven har ännu inte sparat någon reflektion om det här resultatet.'],
    notProvided: ['Non indicato.', 'Not provided.', 'No indicado.', 'Non renseigné.', 'Nicht angegeben.', 'Inte angivet.'],
    noScores: ['Nessun punteggio disponibile per questa compilazione.', 'No scores are available for this submission.', 'No hay puntuaciones disponibles para este resultado.', 'Aucun score disponible pour ce résultat.', 'Für dieses Ergebnis sind keine Werte verfügbar.', 'Inga poäng är tillgängliga för det här resultatet.'],
    updated: ['Ultimo salvataggio:', 'Last saved:', 'Último guardado:', 'Dernier enregistrement :', 'Zuletzt gespeichert:', 'Senast sparad:'],
    pdfError: ['Impossibile scaricare il PDF. Riprova dal pulsante di download.', 'Unable to download the PDF. Try the download button again.', 'No se puede descargar el PDF. Vuelve a pulsar el botón de descarga.', 'Impossible de télécharger le PDF. Réessayez avec le bouton de téléchargement.', 'Das PDF konnte nicht heruntergeladen werden. Versuchen Sie es erneut über die Schaltfläche.', 'Det gick inte att hämta PDF-filen. Försök igen med hämtningsknappen.'],
    conversationError: ['Impossibile caricare la conversazione.', 'Unable to load the conversation.', 'No se puede cargar la conversación.', 'Impossible de charger la conversation.', 'Die Unterhaltung konnte nicht geladen werden.', 'Det gick inte att läsa in samtalet.'],
    noConversation: ['Nessun messaggio disponibile per questa compilazione.', 'No messages are available for this submission.', 'No hay mensajes disponibles para este resultado.', 'Aucun message disponible pour ce résultat.', 'Für dieses Ergebnis sind keine Nachrichten verfügbar.', 'Inga meddelanden är tillgängliga för det här resultatet.'],
    student: ['Studente', 'Student', 'Estudiante', 'Élève', 'Lernende Person', 'Elev'],
    instrument: ['Strumento', 'Tool', 'Herramienta', 'Outil', 'Werkzeug', 'Verktyg'],
    date: ['Data', 'Date', 'Fecha', 'Date', 'Datum', 'Datum'],
    viewAllInClass: ["Vista d'insieme della classe", 'Class results overview', 'Vista de conjunto de la clase', 'Vue d’ensemble de la classe', 'Ergebnisübersicht der Klasse', 'Klassens resultatöversikt'],
} satisfies Record<string, Localized>;

export const classCompilationsText = (lang: Lang, key: keyof typeof labels) => labels[key][Math.max(0, languages.indexOf(lang))];
