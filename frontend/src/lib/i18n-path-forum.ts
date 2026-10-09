import type { Lang } from "./i18n";

const languages: readonly Lang[] = ["it", "en", "es", "fr", "de", "sv"];

// TF7: exact class discussions as class-path steps (it, en, es, fr, de, sv).
export const pathForumTexts = {
  forum: [
    "Discussione del forum",
    "Forum discussion",
    "Debate del foro",
    "Discussion du forum",
    "Forumsdiskussion",
    "Forumdiskussion",
  ],
  choose: [
    "Seleziona discussione",
    "Select discussion",
    "Seleccionar debate",
    "Choisir une discussion",
    "Diskussion auswählen",
    "Välj diskussion",
  ],
  empty: [
    "Nessuna discussione pubblicata in questa classe: aprine una dalla scheda Forum.",
    "No published discussion in this class: open one from the Forum tab.",
    "No hay ningún debate publicado en esta clase: abre uno desde la pestaña Foro.",
    "Aucune discussion publiée dans cette classe : ouvrez-en une depuis l’onglet Forum.",
    "Keine veröffentlichte Diskussion in dieser Klasse: Eröffne eine im Tab Forum.",
    "Ingen publicerad diskussion i den här klassen: starta en från fliken Forum.",
  ],
  rule: [
    "Una discussione pubblicata di questa classe. Il passo è fatto quando la risposta dello studente in quella discussione è pubblicata, dopo l’attivazione del passo: una risposta in attesa di approvazione non conta finché non la approvi, e una risposta nascosta o eliminata non conta più, salvo un’altra risposta valida. Leggere la discussione o rispondere altrove non basta. Se chiudi la discussione le risposte già pubblicate restano valide; se la nascondi o disattivi il forum della classe, il passo non è disponibile. Il percorso vede solo lo stato e l’ora, mai il testo dei messaggi.",
    "A published discussion of this class. The step is done when the student’s reply in that discussion is published, after the step becomes active: a reply awaiting approval does not count until you approve it, and a hidden or deleted reply no longer counts unless another valid reply remains. Reading the discussion or replying elsewhere is not enough. If you lock the discussion, replies already published still count; if you hide it or switch the class forum off, the step is not available. The path sees only status and time, never the text of the messages.",
    "Un debate publicado de esta clase. El paso se completa cuando la respuesta del estudiante en ese debate se publica, después de que el paso se active: una respuesta pendiente de aprobación no cuenta hasta que la apruebes, y una respuesta oculta o eliminada deja de contar salvo que quede otra respuesta válida. Leer el debate o responder en otro no basta. Si cierras el debate, las respuestas ya publicadas siguen contando; si lo ocultas o desactivas el foro de la clase, el paso no está disponible. El itinerario solo ve el estado y la hora, nunca el texto de los mensajes.",
    "Une discussion publiée de cette classe. L’étape est terminée quand la réponse de l’élève dans cette discussion est publiée, après l’activation de l’étape : une réponse en attente d’approbation ne compte pas tant que vous ne l’approuvez pas, et une réponse masquée ou supprimée ne compte plus, sauf s’il reste une autre réponse valide. Lire la discussion ou répondre ailleurs ne suffit pas. Si vous verrouillez la discussion, les réponses déjà publiées comptent toujours ; si vous la masquez ou désactivez le forum de la classe, l’étape n’est pas disponible. Le parcours ne voit que l’état et l’heure, jamais le texte des messages.",
    "Eine veröffentlichte Diskussion dieser Klasse. Der Schritt ist erledigt, wenn die Antwort der Lernenden in dieser Diskussion veröffentlicht ist, nach der Aktivierung des Schritts: Eine Antwort, die auf Freigabe wartet, zählt erst nach deiner Freigabe, und eine ausgeblendete oder gelöschte Antwort zählt nicht mehr, außer es bleibt eine andere gültige Antwort. Die Diskussion zu lesen oder anderswo zu antworten reicht nicht. Sperrst du die Diskussion, zählen bereits veröffentlichte Antworten weiter; blendest du sie aus oder schaltest das Klassenforum ab, ist der Schritt nicht verfügbar. Der Pfad sieht nur Status und Uhrzeit, nie den Text der Nachrichten.",
    "En publicerad diskussion i den här klassen. Steget är klart när elevens svar i den diskussionen är publicerat, efter att steget har aktiverats: ett svar som väntar på godkännande räknas inte förrän du godkänner det, och ett dolt eller raderat svar räknas inte längre om inget annat giltigt svar finns kvar. Att läsa diskussionen eller svara någon annanstans räcker inte. Om du låser diskussionen räknas redan publicerade svar fortfarande; om du döljer den eller stänger av klassens forum är steget inte tillgängligt. Vägen ser bara status och tid, aldrig meddelandenas text.",
  ],
  invalid: [
    "Usa una discussione pubblicata e visibile di questa classe, con il forum attivo, una sola volta per percorso.",
    "Use a published, visible discussion of this class, with the class forum on, once per path.",
    "Usa un debate publicado y visible de esta clase, con el foro activo, una sola vez por itinerario.",
    "Utilisez une discussion publiée et visible de cette classe, avec le forum activé, une seule fois par parcours.",
    "Verwende eine veröffentlichte, sichtbare Diskussion dieser Klasse bei eingeschaltetem Forum, einmal pro Pfad.",
    "Använd en publicerad, synlig diskussion i den här klassen, med forumet påslaget, en gång per väg.",
  ],
  loadError: [
    "Impossibile caricare le discussioni della classe.",
    "Could not load the class discussions.",
    "No se pudieron cargar los debates de la clase.",
    "Impossible de charger les discussions de la classe.",
    "Die Diskussionen der Klasse konnten nicht geladen werden.",
    "Det gick inte att läsa in klassens diskussioner.",
  ],
  retry: ["Riprova", "Retry", "Reintentar", "Réessayer", "Erneut versuchen", "Försök igen"],
  locked: [
    "Discussione chiusa: niente nuove risposte",
    "Discussion locked: no new replies",
    "Debate cerrado: no se admiten respuestas nuevas",
    "Discussion verrouillée : aucune nouvelle réponse",
    "Diskussion gesperrt: keine neuen Antworten",
    "Diskussionen är låst: inga nya svar",
  ],
  studentRule: [
    "Fatto quando la tua risposta in questa discussione è pubblicata.",
    "Done when your reply in this discussion is published.",
    "Completado cuando tu respuesta en este debate se publica.",
    "Terminé quand votre réponse dans cette discussion est publiée.",
    "Erledigt, wenn deine Antwort in dieser Diskussion veröffentlicht ist.",
    "Klart när ditt svar i den här diskussionen är publicerat.",
  ],
  notice_pending: [
    "La tua risposta è in attesa di approvazione del docente: il passo sarà fatto quando verrà pubblicata.",
    "Your reply is awaiting teacher approval: the step will be done once it is published.",
    "Tu respuesta espera la aprobación del docente: el paso se completará cuando se publique.",
    "Votre réponse attend l’approbation de l’enseignant : l’étape sera terminée une fois publiée.",
    "Deine Antwort wartet auf die Freigabe der Lehrkraft: Der Schritt ist erledigt, sobald sie veröffentlicht ist.",
    "Ditt svar väntar på lärarens godkännande: steget blir klart när det publiceras.",
  ],
  notice_locked: [
    "Il docente ha chiuso la discussione: non puoi più rispondere. Chiedi al docente come completare il passo.",
    "The teacher has locked the discussion: you can no longer reply. Ask your teacher how to complete the step.",
    "El docente ha cerrado el debate: ya no puedes responder. Pregunta al docente cómo completar el paso.",
    "L’enseignant a verrouillé la discussion : vous ne pouvez plus répondre. Demandez-lui comment terminer l’étape.",
    "Die Lehrkraft hat die Diskussion gesperrt: Du kannst nicht mehr antworten. Frag sie, wie du den Schritt abschließt.",
    "Läraren har låst diskussionen: du kan inte längre svara. Fråga läraren hur du slutför steget.",
  ],
  notice_muted: [
    "Al momento non puoi scrivere nel forum di questa classe. Chiedi al docente come completare il passo.",
    "You cannot post in this class forum right now. Ask your teacher how to complete the step.",
    "Ahora mismo no puedes escribir en el foro de esta clase. Pregunta al docente cómo completar el paso.",
    "Vous ne pouvez pas écrire dans le forum de cette classe pour le moment. Demandez à l’enseignant comment terminer l’étape.",
    "Du kannst gerade nicht im Forum dieser Klasse schreiben. Frag die Lehrkraft, wie du den Schritt abschließt.",
    "Du kan inte skriva i klassens forum just nu. Fråga läraren hur du slutför steget.",
  ],
  notice_hidden: [
    "Il docente ha nascosto la tua risposta: non conta più. Puoi rispondere di nuovo nella discussione.",
    "The teacher has hidden your reply: it no longer counts. You can reply again in the discussion.",
    "El docente ha ocultado tu respuesta: ya no cuenta. Puedes responder de nuevo en el debate.",
    "L’enseignant a masqué votre réponse : elle ne compte plus. Vous pouvez répondre à nouveau dans la discussion.",
    "Die Lehrkraft hat deine Antwort ausgeblendet: Sie zählt nicht mehr. Du kannst in der Diskussion erneut antworten.",
    "Läraren har dolt ditt svar: det räknas inte längre. Du kan svara igen i diskussionen.",
  ],
} as const satisfies Record<string, readonly string[]>;

export type PathForumTextKey = keyof typeof pathForumTexts;

export function pathForumText(lang: string, key: PathForumTextKey): string {
  const index = languages.indexOf(lang as Lang);
  return pathForumTexts[key][index < 0 ? 1 : index];
}
