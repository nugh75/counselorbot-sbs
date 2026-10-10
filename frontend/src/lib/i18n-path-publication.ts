import type { Lang } from "./i18n";
import type { UnavailableAction } from "./path-publication";

const languages: readonly Lang[] = ["it", "en", "es", "fr", "de", "sv"];

// TF8: publishing and managing a mixed class path (it, en, es, fr, de, sv).
export const pathPublicationTexts = {
  blocked: [
    "Il percorso non è stato pubblicato. Sistema questi passi e riprova:",
    "The path was not published. Fix these steps and try again:",
    "El itinerario no se ha publicado. Corrige estos pasos y vuelve a intentarlo:",
    "Le parcours n’a pas été publié. Corrigez ces étapes et réessayez :",
    "Der Pfad wurde nicht veröffentlicht. Korrigiere diese Schritte und versuche es erneut:",
    "Vägen publicerades inte. Åtgärda de här stegen och försök igen:",
  ],
  lifecycleError: [
    "Impossibile archiviare o ripristinare il percorso. Ricarica e riprova.",
    "Could not archive or restore the path. Reload and try again.",
    "No se pudo archivar ni restaurar el itinerario. Recarga y vuelve a intentarlo.",
    "Impossible d’archiver ou de restaurer le parcours. Rechargez et réessayez.",
    "Der Pfad konnte nicht archiviert oder wiederhergestellt werden. Lade neu und versuche es erneut.",
    "Det gick inte att arkivera eller återställa vägen. Ladda om och försök igen.",
  ],
  action_platform_tool: [
    "Lo strumento è disattivato sulla piattaforma: rimuovi il passo o chiedi all’amministratore di riattivarlo.",
    "The tool is switched off on the platform: remove the step or ask the administrator to switch it back on.",
    "La herramienta está desactivada en la plataforma: elimina el paso o pide al administrador que la reactive.",
    "L’outil est désactivé sur la plateforme : supprimez l’étape ou demandez à l’administrateur de le réactiver.",
    "Das Werkzeug ist auf der Plattform ausgeschaltet: Entferne den Schritt oder bitte die Administration, es wieder einzuschalten.",
    "Verktyget är avstängt på plattformen: ta bort steget eller be administratören att slå på det igen.",
  ],
  action_class_tool: [
    "Lo strumento è spento per questa classe: attivalo nella scheda Strumenti e counselor o rimuovi il passo.",
    "The tool is off for this class: switch it on in the Tools & counselors tab or remove the step.",
    "La herramienta está apagada para esta clase: actívala en la pestaña Herramientas y counselors o elimina el paso.",
    "L’outil est désactivé pour cette classe : activez-le dans l’onglet Outils et counselors ou supprimez l’étape.",
    "Das Werkzeug ist für diese Klasse aus: Schalte es im Tab Werkzeuge und Counselors ein oder entferne den Schritt.",
    "Verktyget är avstängt för den här klassen: slå på det under fliken Verktyg och counselors eller ta bort steget.",
  ],
  action_institute: [
    "Collega la classe al suo istituto e salva le credenziali dell’istituto nella pagina Istituti.",
    "Link the class to its institute and save the institute credentials on the Institutes page.",
    "Vincula la clase a su instituto y guarda las credenciales del instituto en la página Institutos.",
    "Associez la classe à son établissement et enregistrez ses identifiants sur la page Établissements.",
    "Verknüpfe die Klasse mit ihrer Einrichtung und speichere die Zugangsdaten der Einrichtung auf der Seite Einrichtungen.",
    "Koppla klassen till dess lärosäte och spara lärosätets inloggningsuppgifter på sidan Lärosäten.",
  ],
  action_administration: [
    "La somministrazione non è pronta: controlla stato, lingua e classe in Piani di somministrazione.",
    "The administration is not ready: check its status, language and class in Administration plans.",
    "La administración no está lista: revisa su estado, idioma y clase en Planes de administración.",
    "La passation n’est pas prête : vérifiez son statut, sa langue et sa classe dans Plans d’administration.",
    "Die Durchführung ist nicht bereit: Prüfe Status, Sprache und Klasse unter Durchführungspläne.",
    "Genomförandet är inte klart: kontrollera status, språk och klass under Administreringsplaner.",
  ],
  action_results_step: [
    "L’approfondimento segue un passo di somministrazione che non è più disponibile: sistemalo o rimuovi l’approfondimento.",
    "The deep dive follows an administration step that is no longer available: fix it or remove the deep dive.",
    "La profundización sigue a un paso de administración que ya no está disponible: corrígelo o elimina la profundización.",
    "L’approfondissement suit une étape de passation qui n’est plus disponible : corrigez-la ou supprimez l’approfondissement.",
    "Die Vertiefung folgt einem Durchführungsschritt, der nicht mehr verfügbar ist: Korrigiere ihn oder entferne die Vertiefung.",
    "Fördjupningen följer ett genomförandesteg som inte längre är tillgängligt: åtgärda det eller ta bort fördjupningen.",
  ],
  action_assignment: [
    "L’assegnazione è stata revocata o non è più per tutta la classe: sostituisci il passo con un’altra assegnazione.",
    "The assignment was revoked or is no longer for the whole class: replace the step with another assignment.",
    "La asignación se revocó o ya no es para toda la clase: sustituye el paso por otra asignación.",
    "Le devoir a été révoqué ou ne concerne plus toute la classe : remplacez l’étape par un autre devoir.",
    "Die Aufgabe wurde widerrufen oder gilt nicht mehr für die ganze Klasse: Ersetze den Schritt durch eine andere Aufgabe.",
    "Uppgiften har återkallats eller gäller inte längre hela klassen: ersätt steget med en annan uppgift.",
  ],
  action_forum: [
    "La discussione è nascosta o non è più in questa classe: ripristinala nel Forum o sostituisci il passo.",
    "The discussion is hidden or no longer in this class: restore it in the Forum or replace the step.",
    "El debate está oculto o ya no está en esta clase: restáuralo en el Foro o sustituye el paso.",
    "La discussion est masquée ou n’est plus dans cette classe : restaurez-la dans le Forum ou remplacez l’étape.",
    "Die Diskussion ist ausgeblendet oder nicht mehr in dieser Klasse: Stelle sie im Forum wieder her oder ersetze den Schritt.",
    "Diskussionen är dold eller finns inte längre i den här klassen: återställ den i forumet eller ersätt steget.",
  ],
  action_meeting: [
    "L’incontro è stato annullato o non è di questa classe o gruppo: sostituisci il passo con un altro incontro.",
    "The meeting was cancelled or is not of this class or group: replace the step with another meeting.",
    "El encuentro se canceló o no es de esta clase o grupo: sustituye el paso por otro encuentro.",
    "La rencontre a été annulée ou n’appartient pas à cette classe ou ce groupe : remplacez l’étape par une autre rencontre.",
    "Das Treffen wurde abgesagt oder gehört nicht zu dieser Klasse oder Gruppe: Ersetze den Schritt durch ein anderes Treffen.",
    "Mötet har ställts in eller hör inte till den här klassen eller gruppen: ersätt steget med ett annat möte.",
  ],
  action_class_inactive: [
    "La classe è archiviata: riattivala per pubblicare il percorso.",
    "The class is archived: reactivate it to publish the path.",
    "La clase está archivada: reactívala para publicar el itinerario.",
    "La classe est archivée : réactivez-la pour publier le parcours.",
    "Die Klasse ist archiviert: Aktiviere sie wieder, um den Pfad zu veröffentlichen.",
    "Klassen är arkiverad: återaktivera den för att publicera vägen.",
  ],
  action_other: [
    "Questo passo non è disponibile: controlla la sua destinazione o rimuovilo.",
    "This step is not available: check its target or remove it.",
    "Este paso no está disponible: revisa su destino o elimínalo.",
    "Cette étape n’est pas disponible : vérifiez sa cible ou supprimez-la.",
    "Dieser Schritt ist nicht verfügbar: Prüfe sein Ziel oder entferne ihn.",
    "Det här steget är inte tillgängligt: kontrollera dess mål eller ta bort det.",
  ],
  studentUnavailable: [
    "Questa attività non è disponibile ora e non conta nel tuo avanzamento. Chiedi al docente quando sarà aperta.",
    "This activity is not available now and does not count in your progress. Ask your teacher when it will open.",
    "Esta actividad no está disponible ahora y no cuenta en tu progreso. Pregunta a tu docente cuándo se abrirá.",
    "Cette activité n’est pas disponible pour le moment et ne compte pas dans votre progression. Demandez à l’enseignant quand elle ouvrira.",
    "Diese Aktivität ist gerade nicht verfügbar und zählt nicht zu deinem Fortschritt. Frag die Lehrkraft, wann sie geöffnet wird.",
    "Den här aktiviteten är inte tillgänglig nu och räknas inte i dina framsteg. Fråga läraren när den öppnas.",
  ],
  openResearchView: [
    "Apri in Piani di somministrazione",
    "Open in Administration plans",
    "Abrir en Planes de administración",
    "Ouvrir dans Plans d’administration",
    "In Durchführungsplänen öffnen",
    "Öppna i Administreringsplaner",
  ],
  openClassPaths: [
    "Apri i percorsi della classe",
    "Open the class paths",
    "Abrir los itinerarios de la clase",
    "Ouvrir les parcours de la classe",
    "Pfade der Klasse öffnen",
    "Öppna klassens vägar",
  ],
  noInstitute: [
    "Questa classe non è collegata a un istituto: i passi di somministrazione ne hanno bisogno.",
    "This class is not linked to an institute: administration steps need one.",
    "Esta clase no está vinculada a un instituto: los pasos de administración lo necesitan.",
    "Cette classe n’est liée à aucun établissement : les étapes de passation en ont besoin.",
    "Diese Klasse ist mit keiner Einrichtung verknüpft: Durchführungsschritte brauchen eine.",
    "Den här klassen är inte kopplad till något lärosäte: administreringssteg behöver ett.",
  ],
  goToInstitutes: [
    "Vai a Istituti",
    "Go to Institutes",
    "Ir a Institutos",
    "Aller aux établissements",
    "Zu den Einrichtungen",
    "Gå till Lärosäten",
  ],
  teacherGuide: [
    "Il percorso completo segue Istituti, poi la classe, poi la scheda Percorsi di classe. In un percorso puoi mescolare somministrazioni, approfondimento dei risultati, assegnazioni, discussioni del forum e altri strumenti. Pubblica controlla tutti i passi insieme: se qualcuno non è disponibile, il percorso resta com’era e un elenco dice per ogni passo cosa sistemare. Anche il ripristino di un percorso archiviato fa lo stesso controllo e attiva i passi aggiunti nel frattempo. Riordinare i passi o cambiarne titolo, istruzioni e scadenza non cambia la loro attivazione; per cambiare la destinazione di un passo già attivo rimuovilo e aggiungine uno nuovo, che parte da quel momento, mentre lo storico del vecchio passo resta. Pubblica, archivia e ripristina rifiutano una versione superata: ricarica e riprova. Un passo non disponibile non conta nell’avanzamento; docente e studenti vedono il perché. Ogni passo di somministrazione apre lo stesso piano in Piani di somministrazione, e il piano rimanda ai percorsi della classe.",
    "The complete journey goes from Institutes to the class and then to its Class paths tab. A path can mix administrations, a results deep dive, assignments, forum discussions and other tools. Publish checks every step together: if any step is not available, the path stays as it was and a list tells you what to fix for each step. Restoring an archived path runs the same check and activates the steps added in the meantime. Reordering steps or changing their title, instructions and due date keeps their activation; to change the target of an active step, remove it and add a new one, which starts from that moment while the old step keeps its history. Publish, archive and restore refuse an outdated version: reload and try again. An unavailable step does not count in progress; teachers and students see why. Each administration step opens the same plan in Administration plans, and the plan links back to the class paths.",
    "El recorrido completo va de Institutos a la clase y luego a su pestaña Itinerarios de clase. Un itinerario puede combinar administraciones, profundización de resultados, asignaciones, debates del foro y otras herramientas. Publicar revisa todos los pasos a la vez: si alguno no está disponible, el itinerario queda como estaba y una lista indica qué corregir en cada paso. Restaurar un itinerario archivado hace la misma revisión y activa los pasos añadidos entretanto. Reordenar los pasos o cambiar su título, instrucciones y fecha límite conserva su activación; para cambiar el destino de un paso activo, elimínalo y añade uno nuevo, que empieza en ese momento, mientras el paso anterior conserva su historial. Publicar, archivar y restaurar rechazan una versión desactualizada: recarga y vuelve a intentarlo. Un paso no disponible no cuenta en el progreso; docentes y estudiantes ven el motivo. Cada paso de administración abre el mismo plan en Planes de administración, y el plan enlaza con los itinerarios de la clase.",
    "Le parcours complet va des Établissements à la classe, puis à son onglet Parcours de classe. Un parcours peut combiner passations, approfondissement des résultats, devoirs, discussions du forum et autres outils. Publier vérifie toutes les étapes ensemble : si l’une n’est pas disponible, le parcours reste tel quel et une liste indique quoi corriger pour chaque étape. Restaurer un parcours archivé fait la même vérification et active les étapes ajoutées entre-temps. Réordonner les étapes ou modifier leur titre, leurs consignes et leur échéance conserve leur activation ; pour changer la cible d’une étape active, supprimez-la et ajoutez-en une nouvelle, qui commence à ce moment-là, tandis que l’ancienne garde son historique. Publier, archiver et restaurer refusent une version dépassée : rechargez et réessayez. Une étape indisponible ne compte pas dans la progression ; enseignants et élèves en voient la raison. Chaque étape de passation ouvre le même plan dans Plans d’administration, et le plan renvoie aux parcours de la classe.",
    "Der vollständige Weg führt von Einrichtungen zur Klasse und dann zu ihrem Tab Klassenpfade. Ein Pfad kann Durchführungen, eine Vertiefung der Ergebnisse, Aufgaben, Forumsdiskussionen und andere Werkzeuge kombinieren. Veröffentlichen prüft alle Schritte zusammen: Ist ein Schritt nicht verfügbar, bleibt der Pfad unverändert und eine Liste nennt für jeden Schritt, was zu korrigieren ist. Das Wiederherstellen eines archivierten Pfads prüft genauso und aktiviert die inzwischen hinzugefügten Schritte. Umordnen oder Ändern von Titel, Anleitung und Fälligkeit behält die Aktivierung; um das Ziel eines aktiven Schritts zu ändern, entferne ihn und füge einen neuen hinzu, der ab diesem Moment gilt, während der alte Schritt seinen Verlauf behält. Veröffentlichen, Archivieren und Wiederherstellen lehnen eine veraltete Version ab: Lade neu und versuche es erneut. Ein nicht verfügbarer Schritt zählt nicht zum Fortschritt; Lehrkräfte und Lernende sehen den Grund. Jeder Durchführungsschritt öffnet denselben Plan unter Durchführungspläne, und der Plan verweist zurück auf die Klassenpfade.",
    "Hela flödet går från Lärosäten till klassen och sedan till fliken Klassvägar. En väg kan blanda administreringar, fördjupning av resultat, uppgifter, forumdiskussioner och andra verktyg. Publicera kontrollerar alla steg samtidigt: om något steg inte är tillgängligt förblir vägen som den var och en lista visar vad som ska åtgärdas för varje steg. Att återställa en arkiverad väg gör samma kontroll och aktiverar stegen som lagts till under tiden. Att ändra ordning eller ändra titel, instruktioner och sista datum behåller aktiveringen; för att byta mål för ett aktivt steg tar du bort det och lägger till ett nytt, som börjar gälla från den stunden medan det gamla steget behåller sin historik. Publicera, arkivera och återställ avvisar en inaktuell version: ladda om och försök igen. Ett steg som inte är tillgängligt räknas inte i framstegen; lärare och elever ser varför. Varje administreringssteg öppnar samma plan under Administreringsplaner, och planen länkar tillbaka till klassens vägar.",
  ],
} as const satisfies Record<string, readonly string[]>;

export type PathPublicationTextKey = keyof typeof pathPublicationTexts;

export function pathPublicationText(lang: string, key: PathPublicationTextKey): string {
  const index = languages.indexOf(lang as Lang);
  return pathPublicationTexts[key][index < 0 ? 1 : index];
}

/** Teacher-facing sentence that says how to make an unavailable step available again. */
export function unavailableActionText(lang: string, action: UnavailableAction): string {
  return pathPublicationText(lang, `action_${action}`);
}
