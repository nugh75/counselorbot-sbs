const texts = {
    name: ['Nome', 'Name', 'Nombre', 'Nom', 'Name', 'Namn'],
    expand: ['Apri', 'Expand', 'Abrir', 'Développer', 'Öffnen', 'Öppna'],
    collapse: ['Comprimi', 'Collapse', 'Contraer', 'Réduire', 'Zuklappen', 'Fäll ihop'],
    dirty: ['Modifiche non salvate', 'Unsaved changes', 'Cambios sin guardar', 'Modifications non enregistrées', 'Ungespeicherte Änderungen', 'Osparade ändringar'],
    saving: ['Salvataggio in corso', 'Saving', 'Guardando', 'Enregistrement en cours', 'Speichern läuft', 'Sparar'],
    retrySave: ['Riprova salvataggio', 'Retry saving', 'Reintentar guardado', 'Réessayer l’enregistrement', 'Speichern erneut versuchen', 'Försök spara igen'],
    immediate: ['Fascia e istituto si salvano quando cambi la selezione. Salva riguarda il contesto classe.', 'Level and institution are saved when you change the selection. Save applies to the class context.', 'La franja y el instituto se guardan al cambiar la selección. Guardar se aplica al contexto de la clase.', 'Le niveau et l’établissement sont enregistrés quand vous changez la sélection. Enregistrer concerne le contexte de la classe.', 'Stufe und Einrichtung werden gespeichert, sobald Sie die Auswahl ändern. Speichern gilt für den Klassenkontext.', 'Nivå och institution sparas när du ändrar valet. Spara gäller klasskontexten.'],
} as const satisfies Record<string, readonly [string, string, string, string, string, string]>;

export function classLayoutText(lang: string, key: keyof typeof texts): string {
    const index = ['it', 'en', 'es', 'fr', 'de', 'sv'].indexOf(lang);
    return texts[key][index < 0 ? 1 : index];
}
