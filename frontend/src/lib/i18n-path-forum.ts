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
    "Lo studente segna il passo quando considera concluso il proprio intervento e può togliere la spunta. Il piano mostra lo stato, non il testo del forum.",
    "The student marks the step when they consider their contribution finished and can clear the mark. The plan shows the status, not forum text.",
    "El estudiante marca el paso cuando considera terminado su aporte y puede quitar la marca. El plan muestra el estado, no el texto del foro.",
    "L’élève coche l’étape quand il estime son intervention terminée et peut décocher la case. Le plan affiche le statut, pas le texte du forum.",
    "Lernende markieren den Schritt, wenn ihr Beitrag abgeschlossen ist, und können die Markierung entfernen. Der Plan zeigt den Status, nicht den Forumstext.",
    "Eleven markerar steget när bidraget är klart och kan ta bort markeringen. Planen visar statusen, inte forumtexten.",
  ],
  invalid: [
    "Usa una discussione pubblicata e visibile di questa classe, con il forum attivo, una sola volta per piano operativo.",
    "Use a published, visible discussion of this class, with the class forum on, once per operational plan.",
    "Usa un debate publicado y visible de esta clase, con el foro activo, una sola vez por plan operativo.",
    "Utilisez une discussion publiée et visible de cette classe, avec le forum activé, une seule fois par plan opérationnel.",
    "Verwende eine veröffentlichte, sichtbare Diskussion dieser Klasse bei eingeschaltetem Forum, einmal pro Arbeitsplan.",
    "Använd en publicerad, synlig diskussion i den här klassen, med forumet påslaget, en gång per arbetsplan.",
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
  studentDone: ["Intervento concluso", "Contribution finished", "Intervención terminada", "Intervention terminée", "Beitrag abgeschlossen", "Bidrag avslutat"],
  studentRule: [
    "Nel passo del forum metti la spunta quando consideri concluso il tuo intervento. Puoi toglierla se cambi idea.",
    "In a forum step, check the box when you consider your contribution finished. You can clear it if you change your mind.",
    "En el paso del foro, marca la casilla cuando consideres terminado tu aporte. Puedes desmarcarla si cambias de opinión.",
    "Dans le forum, coche la case quand tu estimes ton intervention terminée. Tu peux la décocher si tu changes d’avis.",
    "Markiere im Forumsschritt das Kästchen, wenn dein Beitrag abgeschlossen ist. Du kannst die Markierung wieder entfernen.",
    "I forumsteget markerar du rutan när du tycker att ditt bidrag är klart. Du kan ta bort markeringen om du ändrar dig.",
  ],
  notice_pending: [
    "La tua risposta è in attesa di approvazione del docente.",
    "Your reply is awaiting teacher approval.",
    "Tu respuesta espera la aprobación del docente.",
    "Ta réponse attend l’approbation de l’enseignant.",
    "Deine Antwort wartet auf die Freigabe der Lehrkraft.",
    "Ditt svar väntar på lärarens godkännande.",
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
    "Il docente ha nascosto la tua risposta. Puoi intervenire di nuovo nella discussione.",
    "The teacher has hidden your reply. You can reply again in the discussion.",
    "El docente ha ocultado tu respuesta. Puedes responder de nuevo en el debate.",
    "L’enseignant a masqué ta réponse. Tu peux répondre à nouveau dans la discussion.",
    "Die Lehrkraft hat deine Antwort ausgeblendet. Du kannst erneut antworten.",
    "Läraren har dolt ditt svar. Du kan svara igen i diskussionen.",
  ],
} as const satisfies Record<string, readonly string[]>;

export type PathForumTextKey = keyof typeof pathForumTexts;

export function pathForumText(lang: string, key: PathForumTextKey): string {
  const index = languages.indexOf(lang as Lang);
  return pathForumTexts[key][index < 0 ? 1 : index];
}
