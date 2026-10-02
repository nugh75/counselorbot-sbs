const texts = {
    classes: ['Impossibile caricare le classi. Riprova.', 'Could not load the classes. Try again.', 'No se pudieron cargar las clases. Inténtalo de nuevo.', 'Impossible de charger les classes. Réessayez.', 'Die Klassen konnten nicht geladen werden. Versuchen Sie es erneut.', 'Klasserna kunde inte laddas. Försök igen.'],
    notebook: ['Impossibile caricare il taccuino del docente. Riprova.', 'Could not load the teacher notebook. Try again.', 'No se pudo cargar el cuaderno del docente. Inténtalo de nuevo.', 'Impossible de charger le carnet de l’enseignant. Réessayez.', 'Das Lehrkräfte-Notizbuch konnte nicht geladen werden. Versuchen Sie es erneut.', 'Lärarens anteckningsbok kunde inte laddas. Försök igen.'],
} as const satisfies Record<string, readonly [string, string, string, string, string, string]>;

export function teacherLoadingText(lang: string, key: keyof typeof texts): string {
    const index = ['it', 'en', 'es', 'fr', 'de', 'sv'].indexOf(lang);
    return texts[key][index < 0 ? 1 : index];
}
