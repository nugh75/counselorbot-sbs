const text = {
    start: ['Inizia', 'Start', 'Empezar', 'Commencer', 'Beginnen', 'Börja'],
    resume: ['Continua', 'Continue', 'Continuar', 'Continuer', 'Fortsetzen', 'Fortsätt'],
    review: ['Rivedi', 'Review', 'Revisar', 'Revoir', 'Ansehen', 'Visa'],
    open: ['Apri', 'Open', 'Abrir', 'Ouvrir', 'Öffnen', 'Öppna'],
    openDiscussion: ['Apri discussione', 'Open discussion', 'Abrir debate', 'Ouvrir la discussion', 'Diskussion öffnen', 'Öppna diskussion'],
    anotherAttempt: ['Ricomincia da capo', 'Start over', 'Empezar de nuevo', 'Recommencer depuis le début', 'Von vorn beginnen', 'Börja om från början'],
    newCompilation: ['Compila di nuovo', 'Fill it in again', 'Rellenar de nuevo', 'Remplir à nouveau', 'Erneut ausfüllen', 'Fyll i igen'],
    seeResults: ['Vedi i risultati', 'See the results', 'Ver los resultados', 'Voir les résultats', 'Ergebnisse ansehen', 'Se resultaten'],
    rereadConversation: ['Rileggi la conversazione', 'Reread the conversation', 'Volver a leer la conversación', 'Relire la conversation', 'Gespräch nochmals lesen', 'Läs samtalet igen'],
    history: ['Le volte precedenti', 'Previous times', 'Las veces anteriores', 'Les fois précédentes', 'Frühere Durchgänge', 'Tidigare gånger'],
    back: ['Torna al piano', 'Back to plan', 'Volver al plan', 'Retour au plan', 'Zurück zum Plan', 'Tillbaka till planen'],
    saveExit: ['Salva ed esci', 'Save and exit', 'Guardar y salir', 'Enregistrer et quitter', 'Speichern und verlassen', 'Spara och avsluta'],
    error: ['Non è stato possibile recuperare o salvare l’attività. Riprova: il tentativo resta conservato.', 'The activity could not be restored or saved. Try again; your attempt is preserved.', 'No se pudo recuperar o guardar la actividad. Inténtalo de nuevo; el intento se conserva.', 'Impossible de restaurer ou enregistrer l’activité. Réessayez ; votre tentative est conservée.', 'Die Aktivität konnte nicht geladen oder gespeichert werden. Bitte erneut versuchen; der Versuch bleibt erhalten.', 'Aktiviteten kunde inte återställas eller sparas. Försök igen; ditt försök finns kvar.'],
    loading: ['Caricamento attività…', 'Loading activity…', 'Cargando actividad…', 'Chargement de l’activité…', 'Aktivität wird geladen…', 'Laddar aktivitet…'],
    retry: ['Riprova', 'Retry', 'Reintentar', 'Réessayer', 'Erneut versuchen', 'Försök igen'],
    saved: ['Risultati salvati', 'Results saved', 'Resultados guardados', 'Résultats enregistrés', 'Ergebnisse gespeichert', 'Resultaten har sparats'],
    saveResults: ['Salva risultati', 'Save results', 'Guardar resultados', 'Enregistrer les résultats', 'Ergebnisse speichern', 'Spara resultaten'],
    next: ['Vai all’approfondimento', 'Go to the analysis', 'Ir al análisis', 'Passer à l’analyse', 'Zur Auswertung', 'Gå till analysen'],
    restarted: ['Hai ricominciato: puoi continuare quando vuoi. L’attività resta completata.', 'You started over: continue whenever you like. The activity stays completed.', 'Has empezado de nuevo: puedes continuar cuando quieras. La actividad sigue completada.', 'Vous avez recommencé : continuez quand vous voulez. L’activité reste terminée.', 'Du hast neu begonnen: Du kannst jederzeit weitermachen. Die Aktivität bleibt erledigt.', 'Du har börjat om: fortsätt när du vill. Aktiviteten är fortfarande klar.'],
    savedDraft: ['Bozza salvata', 'Draft saved', 'Borrador guardado', 'Brouillon enregistré', 'Entwurf gespeichert', 'Utkast sparat'],
    savedActivity: ['Attività salvata', 'Activity saved', 'Actividad guardada', 'Activité enregistrée', 'Aktivität gespeichert', 'Aktiviteten har sparats'],
    saveFailed: ['Salvataggio non riuscito: riprova prima di uscire.', 'Save failed: try again before leaving.', 'Error al guardar: reintenta antes de salir.', 'Échec de l’enregistrement : réessayez avant de quitter.', 'Speichern fehlgeschlagen: Vor dem Verlassen erneut versuchen.', 'Det gick inte att spara: försök igen innan du lämnar.'],
    saving: ['Salvataggio…', 'Saving…', 'Guardando…', 'Enregistrement…', 'Wird gespeichert…', 'Sparar…'],
    readOnly: ['Attività svolta', 'Completed activity', 'Actividad realizada', 'Activité réalisée', 'Abgeschlossene Aktivität', 'Genomförd aktivitet'],
    conversation: ['Conversazione svolta', 'Conversation', 'Conversación realizada', 'Conversation réalisée', 'Bisheriges Gespräch', 'Tidigare konversation'],
    chooseResult: ['Scegli la compilazione', 'Choose a result', 'Elegir un resultado', 'Choisir un résultat', 'Ergebnis auswählen', 'Välj ett resultat'],
    pathOptions: ['Opzioni del percorso', 'Path options', 'Opciones del recorrido', 'Options du parcours', 'Optionen für den Ablauf', 'Alternativ för vägen'],
    newPathOptions: ['Opzioni per un altro tentativo', 'Options for another attempt', 'Opciones para otro intento', 'Options pour une autre tentative', 'Optionen für einen neuen Versuch', 'Alternativ för ett nytt försök'],
    repeatTitle: ['Iniziare un nuovo tentativo?', 'Start a new attempt?', '¿Empezar un nuevo intento?', 'Commencer une nouvelle tentative ?', 'Einen neuen Versuch beginnen?', 'Börja ett nytt försök?'],
    repeatBody: ['Il tentativo precedente resta salvato. Quando avrai finito, sceglierai quale tentativo conta per il piano: finché non scegli, conta l’ultimo completato.', 'Your previous attempt stays saved. When you finish, you choose which attempt counts for the plan; until you choose, the latest completed one counts.', 'Tu intento anterior queda guardado. Al terminar, eliges qué intento cuenta para el plan; hasta que elijas, cuenta el último completado.', 'Votre tentative précédente reste enregistrée. À la fin, vous choisissez celle qui compte pour le plan ; tant que vous ne choisissez pas, la dernière terminée compte.', 'Dein bisheriger Versuch bleibt gespeichert. Danach wählst du, welcher Versuch für den Plan zählt; bis dahin zählt der zuletzt abgeschlossene.', 'Ditt tidigare försök finns kvar. När du är klar väljer du vilket försök som räknas för planen; tills du väljer räknas det senast avslutade.'],
    repeatConfirm: ['Inizia il nuovo tentativo', 'Start the new attempt', 'Empezar el nuevo intento', 'Commencer la nouvelle tentative', 'Neuen Versuch beginnen', 'Börja det nya försöket'],
    cancel: ['Annulla', 'Cancel', 'Cancelar', 'Annuler', 'Abbrechen', 'Avbryt'],
    countThis: ['Conta questo', 'Count this one', 'Contar este', 'Compter celle-ci', 'Diesen zählen', 'Räkna detta'],
    counted: ['Conta per il piano', 'Counts for the plan', 'Cuenta para el plan', 'Compte pour le plan', 'Zählt für den Plan', 'Räknas för planen'],
    countFailed: ['Non è stato possibile cambiare il tentativo che conta. Riprova.', 'The counted attempt could not be changed. Try again.', 'No se pudo cambiar el intento que cuenta. Inténtalo de nuevo.', 'Impossible de changer la tentative qui compte. Réessayez.', 'Der zählende Versuch konnte nicht geändert werden. Bitte erneut versuchen.', 'Det gick inte att byta försöket som räknas. Försök igen.'],
    allAttempts: ['Tutti i tentativi', 'All attempts', 'Todos los intentos', 'Toutes les tentatives', 'Alle Versuche', 'Alla försök'],
} as const;
export type PathActivityTextKey = keyof typeof text;
export function pathActivityText(lang: string, key: string): string {
    const index = ['it', 'en', 'es', 'fr', 'de', 'sv'].indexOf(lang);
    const values = text[key as PathActivityTextKey];
    return values ? values[index < 0 ? 0 : index] : key;
}
