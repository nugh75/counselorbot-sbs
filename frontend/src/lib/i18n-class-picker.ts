const texts = {
    title: ['Modifica classe o gruppo', 'Edit class or group', 'Editar clase o grupo', 'Modifier une classe ou un groupe', 'Klasse oder Gruppe bearbeiten', 'Redigera klass eller grupp'],
    choose: ['Scegli una classe o un gruppo', 'Choose a class or group', 'Elige una clase o un grupo', 'Choisissez une classe ou un groupe', 'Klasse oder Gruppe auswählen', 'Välj en klass eller grupp'],
    label: ['Classe/gruppo', 'Class/group', 'Clase/grupo', 'Classe/groupe', 'Klasse/Gruppe', 'Klass/grupp'],
    cancelHint: ['Annulla scarta solo le modifiche al contesto. Fascia e istituto già salvati restano tali.', 'Cancel discards only context changes. Level and institution already saved stay saved.', 'Cancelar descarta solo los cambios del contexto. La franja y el instituto ya guardados se conservan.', 'Annuler abandonne uniquement les modifications du contexte. Le niveau et l’établissement déjà enregistrés sont conservés.', 'Abbrechen verwirft nur Kontextänderungen. Bereits gespeicherte Stufe und Einrichtung bleiben gespeichert.', 'Avbryt kastar bara ändringar i kontexten. Redan sparad nivå och institution förblir sparade.'],
    discardTitle: ['Scartare le modifiche al contesto?', 'Discard context changes?', '¿Descartar los cambios del contexto?', 'Abandonner les modifications du contexte ?', 'Kontextänderungen verwerfen?', 'Kasta ändringar i kontexten?'],
    keep: ['Continua a modificare', 'Keep editing', 'Seguir editando', 'Continuer à modifier', 'Weiter bearbeiten', 'Fortsätt redigera'],
    discard: ['Scarta modifiche e prosegui', 'Discard changes and continue', 'Descartar cambios y continuar', 'Abandonner et continuer', 'Änderungen verwerfen und fortfahren', 'Kasta ändringar och fortsätt'],
    institutionsError: ['Impossibile caricare gli istituti. Riprova.', 'Could not load institutions. Try again.', 'No se pudieron cargar los institutos. Inténtalo de nuevo.', 'Impossible de charger les établissements. Réessayez.', 'Die Einrichtungen konnten nicht geladen werden. Versuchen Sie es erneut.', 'Institutionerna kunde inte laddas. Försök igen.'],
} as const satisfies Record<string, readonly [string, string, string, string, string, string]>;

export function classPickerText(lang: string, key: keyof typeof texts): string {
    const index = ['it', 'en', 'es', 'fr', 'de', 'sv'].indexOf(lang);
    return texts[key][index < 0 ? 1 : index];
}
