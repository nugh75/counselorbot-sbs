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
} as const;
export type PathActivityTextKey = keyof typeof text;
export function pathActivityText(lang: string, key: string): string {
    const index = ['it', 'en', 'es', 'fr', 'de', 'sv'].indexOf(lang);
    const values = text[key as PathActivityTextKey];
    return values ? values[index < 0 ? 0 : index] : key;
}
