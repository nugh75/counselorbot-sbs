// Class and group meetings (#175): teacher planning, student attendance and timeline.
type Localized = readonly [string, string, string, string, string, string];

const texts = {
    meeting: ['Incontro', 'Meeting', 'Encuentro', 'Rencontre', 'Treffen', 'Möte'],
    meetings: ['Incontri della classe o del gruppo', 'Class or group meetings', 'Encuentros de la clase o del grupo', 'Rencontres de la classe ou du groupe', 'Treffen der Klasse oder Gruppe', 'Klassens eller gruppens möten'],
    newMeeting: ['Nuovo incontro', 'New meeting', 'Nuevo encuentro', 'Nouvelle rencontre', 'Neues Treffen', 'Nytt möte'],
    topic: ['Argomento', 'Topic', 'Tema', 'Sujet', 'Thema', 'Ämne'],
    description: ['Descrizione (facoltativa)', 'Description (optional)', 'Descripción (opcional)', 'Description (facultative)', 'Beschreibung (optional)', 'Beskrivning (valfri)'],
    startsAt: ['Data e ora', 'Date and time', 'Fecha y hora', 'Date et heure', 'Datum und Uhrzeit', 'Datum och tid'],
    duration: ['Durata in minuti (facoltativa)', 'Duration in minutes (optional)', 'Duración en minutos (opcional)', 'Durée en minutes (facultative)', 'Dauer in Minuten (optional)', 'Längd i minuter (valfri)'],
    mode: ['Modalità', 'Format', 'Modalidad', 'Modalité', 'Form', 'Form'],
    in_person: ['In presenza', 'In person', 'Presencial', 'En présentiel', 'Vor Ort', 'På plats'],
    online: ['Online', 'Online', 'En línea', 'En ligne', 'Online', 'Online'],
    place: ['Luogo', 'Place', 'Lugar', 'Lieu', 'Ort', 'Plats'],
    link: ['Link dell’incontro', 'Meeting link', 'Enlace del encuentro', 'Lien de la rencontre', 'Link zum Treffen', 'Länk till mötet'],
    save: ['Salva incontro', 'Save meeting', 'Guardar encuentro', 'Enregistrer la rencontre', 'Treffen speichern', 'Spara mötet'],
    edit: ['Modifica', 'Edit', 'Editar', 'Modifier', 'Bearbeiten', 'Redigera'],
    discard: ['Annulla', 'Cancel', 'Cancelar', 'Annuler', 'Abbrechen', 'Avbryt'],
    cancelMeeting: ['Annulla incontro', 'Cancel meeting', 'Cancelar encuentro', 'Annuler la rencontre', 'Treffen absagen', 'Ställ in mötet'],
    cancelConfirm: [
        'Annullare l’incontro? Gli studenti lo vedranno come annullato e il passo non sarà più disponibile.',
        'Cancel the meeting? Students will see it as cancelled and the step will no longer be available.',
        '¿Cancelar el encuentro? Los estudiantes lo verán como cancelado y el paso dejará de estar disponible.',
        'Annuler la rencontre ? Les élèves la verront comme annulée et l’étape ne sera plus disponible.',
        'Treffen absagen? Die Lernenden sehen es als abgesagt, und der Schritt ist nicht mehr verfügbar.',
        'Ställa in mötet? Eleverna ser det som inställt och steget är inte längre tillgängligt.',
    ],
    keep: ['No, mantieni', 'No, keep it', 'No, mantener', 'Non, garder', 'Nein, behalten', 'Nej, behåll'],
    cancelled: ['Annullato', 'Cancelled', 'Cancelado', 'Annulée', 'Abgesagt', 'Inställt'],
    choose: ['Scegli un incontro…', 'Choose a meeting…', 'Elige un encuentro…', 'Choisir une rencontre…', 'Treffen wählen…', 'Välj ett möte…'],
    empty: ['Nessun incontro: creane uno qui sotto.', 'No meetings yet: create one below.', 'Ningún encuentro: crea uno abajo.', 'Aucune rencontre : créez-en une ci-dessous.', 'Noch keine Treffen: Lege unten eines an.', 'Inga möten än: skapa ett nedan.'],
    attendances: ['presenze segnate', 'attendances marked', 'asistencias marcadas', 'présences indiquées', 'Teilnahmen markiert', 'markerade närvaron'],
    rule: [
        'Il passo è fatto quando lo studente segna di aver partecipato, a partire dall’inizio dell’incontro. Non c’è un registro del docente; se sposti la data, le presenze già segnate restano.',
        'The step is done when the student marks having attended, from the start of the meeting. There is no teacher register; if you move the date, attendance already marked stays.',
        'El paso está hecho cuando el estudiante marca que ha participado, desde el inicio del encuentro. No hay registro del docente; si cambias la fecha, las asistencias ya marcadas se mantienen.',
        'L’étape est faite quand l’élève indique avoir participé, dès le début de la rencontre. Il n’y a pas de registre de l’enseignant ; si vous déplacez la date, les présences déjà indiquées restent.',
        'Der Schritt ist erledigt, wenn die lernende Person ab Beginn des Treffens ihre Teilnahme markiert. Es gibt kein Lehrkraft-Register; verschiebst du das Datum, bleiben markierte Teilnahmen bestehen.',
        'Steget är klart när eleven markerar att hen deltagit, från mötets början. Det finns ingen lärarnärvarolista; flyttar du datumet ligger redan markerad närvaro kvar.',
    ],
    attended: ['Ho partecipato', 'I attended', 'He participado', 'J’ai participé', 'Ich habe teilgenommen', 'Jag deltog'],
    undoAttended: ['Annulla la presenza', 'Undo attendance', 'Deshacer asistencia', 'Annuler la présence', 'Teilnahme zurücknehmen', 'Ångra närvaro'],
    attendedDone: ['Presenza segnata', 'Attendance marked', 'Asistencia marcada', 'Présence indiquée', 'Teilnahme markiert', 'Närvaro markerad'],
    notStarted: [
        'Potrai segnare la presenza dall’inizio dell’incontro.',
        'You can mark attendance from the start of the meeting.',
        'Podrás marcar la asistencia desde el inicio del encuentro.',
        'Vous pourrez indiquer votre présence dès le début de la rencontre.',
        'Du kannst deine Teilnahme ab Beginn des Treffens markieren.',
        'Du kan markera närvaro från mötets början.',
    ],
    openLink: ['Apri il link dell’incontro', 'Open the meeting link', 'Abrir el enlace del encuentro', 'Ouvrir le lien de la rencontre', 'Link zum Treffen öffnen', 'Öppna länken till mötet'],
    error: [
        'Non è stato possibile salvare: controlla data, luogo o link e riprova.',
        'Could not save: check date, place or link and try again.',
        'No se pudo guardar: revisa fecha, lugar o enlace e inténtalo de nuevo.',
        'Enregistrement impossible : vérifiez la date, le lieu ou le lien et réessayez.',
        'Speichern nicht möglich: Prüfe Datum, Ort oder Link und versuche es erneut.',
        'Det gick inte att spara: kontrollera datum, plats eller länk och försök igen.',
    ],
    conflict: [
        'L’incontro è stato modificato nel frattempo: ricarica la pagina.',
        'The meeting changed meanwhile: reload the page.',
        'El encuentro cambió mientras tanto: recarga la página.',
        'La rencontre a changé entre-temps : rechargez la page.',
        'Das Treffen wurde inzwischen geändert: Lade die Seite neu.',
        'Mötet har ändrats under tiden: ladda om sidan.',
    ],
    loadError: ['Impossibile caricare gli incontri.', 'Could not load the meetings.', 'No se pudieron cargar los encuentros.', 'Impossible de charger les rencontres.', 'Treffen konnten nicht geladen werden.', 'Det gick inte att läsa in mötena.'],
    retry: ['Riprova', 'Try again', 'Reintentar', 'Réessayer', 'Erneut versuchen', 'Försök igen'],
    timelineTitle: ['Incontri delle tue classi o gruppi', 'Meetings of your classes or groups', 'Encuentros de tus clases o grupos', 'Rencontres de tes classes ou groupes', 'Treffen deiner Klassen oder Gruppen', 'Möten i dina klasser eller grupper'],
    studentRule: [
        'Dopo aver partecipato, segna la presenza: il passo risulta fatto.',
        'After attending, mark your attendance: the step is then done.',
        'Después de participar, marca tu asistencia: el paso queda hecho.',
        'Après avoir participé, indique ta présence : l’étape est alors faite.',
        'Markiere nach dem Treffen deine Teilnahme: Dann ist der Schritt erledigt.',
        'Markera närvaro efter mötet: då är steget klart.',
    ],
} satisfies Record<string, Localized>;

export type ClassMeetingTextKey = keyof typeof texts;
const languages = ['it', 'en', 'es', 'fr', 'de', 'sv'];

export function classMeetingText(lang: string, key: ClassMeetingTextKey): string {
    return texts[key][Math.max(0, languages.indexOf(lang))];
}
