export const forumTexts = {
    forum: ['Forum', 'Forum', 'Foro', 'Forum', 'Forum', 'Forum'],
    newTopic: ['Nuova discussione', 'New discussion', 'Nueva discusión', 'Nouvelle discussion', 'Neue Diskussion', 'Ny diskussion'],
    empty: ['Nessuna discussione. I docenti possono aprire la prima.', 'No discussions yet. Teachers can open the first one.', 'No hay discusiones. Los docentes pueden abrir la primera.', 'Aucune discussion. Les enseignants peuvent ouvrir la première.', 'Noch keine Diskussionen. Lehrkräfte können die erste eröffnen.', 'Inga diskussioner ännu. Lärare kan starta den första.'],
    archive: ['Archivio — sola lettura', 'Archive — read only', 'Archivo — solo lectura', 'Archive — lecture seule', 'Archiv — nur lesen', 'Arkiv — skrivskyddat'],
    closed: ['Questa discussione è chiusa.', 'This discussion is closed.', 'Esta discusión está cerrada.', 'Cette discussion est fermée.', 'Diese Diskussion ist geschlossen.', 'Den här diskussionen är stängd.'],
    pinned: ['In evidenza', 'Pinned', 'Fijada', 'Épinglée', 'Angeheftet', 'Fäst'],
    replies: ['risposte', 'replies', 'respuestas', 'réponses', 'Antworten', 'svar'],
    title: ['Titolo', 'Title', 'Título', 'Titre', 'Titel', 'Titel'],
    body: ['Testo', 'Text', 'Texto', 'Texte', 'Text', 'Text'],
    reply: ['Risposta', 'Reply', 'Respuesta', 'Réponse', 'Antwort', 'Svar'],
    send: ['Invia', 'Send', 'Enviar', 'Envoyer', 'Senden', 'Skicka'],
    sending: ['Invio in corso', 'Sending', 'Enviando', 'Envoi en cours', 'Wird gesendet', 'Skickar'],
    back: ['Discussioni', 'Discussions', 'Discusiones', 'Discussions', 'Diskussionen', 'Diskussioner'],
    classes: ['Classi', 'Classes', 'Clases', 'Classes', 'Klassen', 'Klasser'],
    cancel: ['Annulla', 'Cancel', 'Cancelar', 'Annuler', 'Abbrechen', 'Avbryt'],
    discard: ['Scartare il messaggio non inviato?', 'Discard the unsent message?', '¿Descartar el mensaje sin enviar?', 'Abandonner le message non envoyé ?', 'Die ungesendete Nachricht verwerfen?', 'Kasta det oskickade meddelandet?'],
    loadError: ['Impossibile caricare il forum.', 'Could not load the forum.', 'No se pudo cargar el foro.', 'Impossible de charger le forum.', 'Das Forum konnte nicht geladen werden.', 'Kunde inte ladda forumet.'],
    sendError: ['Invio non riuscito. La bozza è conservata.', 'Could not send. Your draft is preserved.', 'No se pudo enviar. El borrador se conserva.', 'Envoi impossible. Votre brouillon est conservé.', 'Senden fehlgeschlagen. Ihr Entwurf bleibt erhalten.', 'Kunde inte skicka. Ditt utkast finns kvar.'],
    rateLimit: ['Limite raggiunto: attendi 5 minuti. La bozza è conservata.', 'Posting limit reached: wait 5 minutes. Your draft is preserved.', 'Límite alcanzado: espera 5 minutos. El borrador se conserva.', 'Limite atteinte : attendez 5 minutes. Votre brouillon est conservé.', 'Limit erreicht: Warten Sie 5 Minuten. Ihr Entwurf bleibt erhalten.', 'Skrivgränsen är nådd: vänta 5 minuter. Ditt utkast finns kvar.'],
    forbidden: ['Non hai accesso a questo forum.', 'You do not have access to this forum.', 'No tienes acceso a este foro.', 'Vous n’avez pas accès à ce forum.', 'Sie haben keinen Zugang zu diesem Forum.', 'Du har inte tillgång till det här forumet.'],
    retry: ['Riprova', 'Retry', 'Reintentar', 'Réessayer', 'Erneut versuchen', 'Försök igen'],
    loading: ['Caricamento…', 'Loading…', 'Cargando…', 'Chargement…', 'Wird geladen…', 'Laddar…'],
    previous: ['Precedenti', 'Previous', 'Anteriores', 'Précédents', 'Zurück', 'Föregående'],
    more: ['Carica altri', 'Load more', 'Cargar más', 'Charger plus', 'Weitere laden', 'Ladda fler'],
    hidden: ['Messaggio nascosto dal docente', 'Message hidden by the teacher', 'Mensaje ocultado por el docente', 'Message masqué par l’enseignant', 'Von der Lehrkraft ausgeblendete Nachricht', 'Meddelandet har dolts av läraren'],
    deleted: ['Messaggio eliminato', 'Message deleted', 'Mensaje eliminado', 'Message supprimé', 'Nachricht gelöscht', 'Meddelandet har raderats'],
    safeText: ['Solo testo: grassetto, corsivo, elenchi e link. Nessun allegato. I contenuti del forum non vengono inviati a modelli AI.', 'Text only: bold, italics, lists and links. No attachments. Forum content is never sent to AI models.', 'Solo texto: negrita, cursiva, listas y enlaces. Sin adjuntos. El contenido del foro no se envía a modelos de IA.', 'Texte uniquement : gras, italique, listes et liens. Sans pièces jointes. Le contenu du forum n’est jamais envoyé aux modèles d’IA.', 'Nur Text: Fett, Kursiv, Listen und Links. Keine Anhänge. Foreninhalte werden niemals an KI-Modelle gesendet.', 'Endast text: fetstil, kursiv, listor och länkar. Inga bilagor. Foruminnehåll skickas aldrig till AI-modeller.'],
} as const satisfies Record<string, readonly [string, string, string, string, string, string]>;

export function forumText(lang: string, key: keyof typeof forumTexts): string {
    const index = ['it', 'en', 'es', 'fr', 'de', 'sv'].indexOf(lang);
    return forumTexts[key][index < 0 ? 1 : index];
}
