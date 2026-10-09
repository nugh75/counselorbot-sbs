import type { Lang } from "./i18n";

const languages: readonly Lang[] = ["it", "en", "es", "fr", "de", "sv"];

// TF6: whole-class goal assignments as class-path steps (it, en, es, fr, de, sv).
export const pathAssignmentTexts = {
  assignment: [
    "Assegnazione",
    "Assignment",
    "Asignación",
    "Attribution",
    "Zuweisung",
    "Tilldelning",
  ],
  choose: [
    "Seleziona assegnazione",
    "Select assignment",
    "Seleccionar asignación",
    "Choisir une attribution",
    "Zuweisung auswählen",
    "Välj tilldelning",
  ],
  create: [
    "Crea assegnazione per la classe",
    "Create class assignment",
    "Crear asignación para la clase",
    "Créer une attribution pour la classe",
    "Zuweisung für die Klasse erstellen",
    "Skapa tilldelning för klassen",
  ],
  empty: [
    "Nessuna assegnazione all’intera classe disponibile: creane una.",
    "No whole-class assignment available: create one.",
    "No hay ninguna asignación para toda la clase: crea una.",
    "Aucune attribution à toute la classe disponible : créez-en une.",
    "Keine Zuweisung an die ganze Klasse verfügbar: Erstelle eine.",
    "Ingen tilldelning till hela klassen finns: skapa en.",
  ],
  rule: [
    "Obiettivo del catalogo con strategie e materiali allegati, assegnato a tutta la classe. Il passo è fatto quando lo studente invia esplicitamente il suo lavoro dopo l’attivazione del passo; aprire l’assegnazione, pianificarla in privato o ricevere un riscontro non basta, e il riscontro del docente non è richiesto. Se lo studente ritira l’invio o l’assegnazione viene revocata, il passo non risulta più fatto. È la stessa assegnazione della pagina Assegnazioni: le assegnazioni a singoli studenti restano solo lì.",
    "Catalog goal with attached strategies and materials, assigned to the whole class. The step is done when the student explicitly submits their work after the step becomes active; opening the assignment, planning it privately or receiving feedback is not enough, and teacher feedback is not required. If the student withdraws the submission or the assignment is revoked, the step is no longer done. It is the same assignment as on the Assignments page: assignments to individual students stay there only.",
    "Objetivo del catálogo con estrategias y materiales adjuntos, asignado a toda la clase. El paso se completa cuando el estudiante envía explícitamente su trabajo después de que el paso se active; abrir la asignación, planificarla en privado o recibir comentarios no basta, y los comentarios del docente no son necesarios. Si el estudiante retira el envío o la asignación se revoca, el paso deja de estar completado. Es la misma asignación de la página Asignaciones: las asignaciones a estudiantes individuales se quedan solo allí.",
    "Objectif du catalogue avec stratégies et matériels joints, attribué à toute la classe. L’étape est terminée quand l’élève envoie explicitement son travail après l’activation de l’étape ; ouvrir l’attribution, la planifier en privé ou recevoir un retour ne suffit pas, et le retour de l’enseignant n’est pas requis. Si l’élève retire son envoi ou si l’attribution est révoquée, l’étape n’est plus terminée. C’est la même attribution que sur la page Attributions : les attributions à des élèves individuels y restent seules.",
    "Katalogziel mit angehängten Strategien und Materialien, der ganzen Klasse zugewiesen. Der Schritt ist erledigt, wenn Lernende ihre Arbeit nach der Aktivierung des Schritts ausdrücklich einreichen; die Zuweisung zu öffnen, sie privat zu planen oder Rückmeldung zu erhalten reicht nicht, und eine Rückmeldung der Lehrkraft ist nicht nötig. Ziehen Lernende die Einreichung zurück oder wird die Zuweisung widerrufen, ist der Schritt nicht mehr erledigt. Es ist dieselbe Zuweisung wie auf der Seite Zuweisungen: Zuweisungen an einzelne Lernende bleiben nur dort.",
    "Mål från katalogen med bifogade strategier och material, tilldelat hela klassen. Steget är klart när eleven uttryckligen lämnar in sitt arbete efter att steget har aktiverats; att öppna tilldelningen, planera den privat eller få återkoppling räcker inte, och lärarens återkoppling krävs inte. Om eleven drar tillbaka inlämningen eller tilldelningen återkallas är steget inte längre klart. Det är samma tilldelning som på sidan Tilldelningar: tilldelningar till enskilda elever stannar bara där.",
  ],
  invalid: [
    "Usa un’assegnazione attiva a tutta questa classe, con un obiettivo del catalogo, una sola volta per percorso.",
    "Use an active assignment to this whole class, with a catalog goal, once per path.",
    "Usa una asignación activa para toda esta clase, con un objetivo del catálogo, una sola vez por itinerario.",
    "Utilisez une attribution active à toute cette classe, avec un objectif du catalogue, une seule fois par parcours.",
    "Verwende eine aktive Zuweisung an diese ganze Klasse mit einem Katalogziel, einmal pro Pfad.",
    "Använd en aktiv tilldelning till hela den här klassen, med ett mål från katalogen, en gång per väg.",
  ],
  loadError: [
    "Impossibile caricare le assegnazioni della classe.",
    "Could not load the class assignments.",
    "No se pudieron cargar las asignaciones de la clase.",
    "Impossible de charger les attributions de la classe.",
    "Die Zuweisungen der Klasse konnten nicht geladen werden.",
    "Det gick inte att läsa in klassens tilldelningar.",
  ],
  retry: ["Riprova", "Retry", "Reintentar", "Réessayer", "Erneut versuchen", "Försök igen"],
  studentRule: [
    "Fatto quando invii il tuo lavoro dall’assegnazione. Le note private non vengono condivise.",
    "Done when you submit your work from the assignment. Private notes are not shared.",
    "Completado cuando envías tu trabajo desde la asignación. Las notas privadas no se comparten.",
    "Terminé quand vous envoyez votre travail depuis l’attribution. Les notes privées ne sont pas partagées.",
    "Erledigt, wenn du deine Arbeit aus der Zuweisung einreichst. Private Notizen werden nicht geteilt.",
    "Klart när du lämnar in ditt arbete från tilldelningen. Privata anteckningar delas inte.",
  ],
} as const satisfies Record<string, readonly string[]>;

export type PathAssignmentTextKey = keyof typeof pathAssignmentTexts;

export function pathAssignmentText(lang: string, key: PathAssignmentTextKey): string {
  const index = languages.indexOf(lang as Lang);
  return pathAssignmentTexts[key][index < 0 ? 1 : index];
}
