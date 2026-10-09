const texts = {
    label: ['Vista attiva', 'Active view', 'Vista activa', 'Vue active', 'Aktive Ansicht', 'Aktiv vy'],
    all: ['Tutti gli strumenti', 'All tools', 'Todas las herramientas', 'Tous les outils', 'Alle Werkzeuge', 'Alla verktyg'],
    classes: ['Le mie classi', 'My classes', 'Mis clases', 'Mes classes', 'Meine Klassen', 'Mina klasser'],
    class: ['Classe {name}', 'Class {name}', 'Clase {name}', 'Classe {name}', 'Klasse {name}', 'Klass {name}'],
    hint: [
        'La classe consiglia gli strumenti da usare: puoi passare a tutti gli strumenti quando vuoi.',
        'Your class recommends which tools to use: you can switch to all tools at any time.',
        'Tu clase recomienda qué herramientas usar: puedes pasar a todas las herramientas cuando quieras.',
        'Ta classe recommande les outils à utiliser : tu peux passer à tous les outils à tout moment.',
        'Deine Klasse empfiehlt, welche Werkzeuge du nutzt: Du kannst jederzeit zu allen Werkzeugen wechseln.',
        'Din klass rekommenderar vilka verktyg du använder: du kan byta till alla verktyg när du vill.',
    ],
    error: [
        'Impossibile cambiare vista. Riprova.',
        'Could not switch view. Try again.',
        'No se pudo cambiar la vista. Inténtalo de nuevo.',
        'Impossible de changer de vue. Réessaie.',
        'Die Ansicht konnte nicht gewechselt werden. Versuche es erneut.',
        'Det gick inte att byta vy. Försök igen.',
    ],
} as const satisfies Record<string, readonly [string, string, string, string, string, string]>;

export function classViewText(lang: string, key: keyof typeof texts, name = ''): string {
    const index = ['it', 'en', 'es', 'fr', 'de', 'sv'].indexOf(lang);
    return texts[key][index < 0 ? 1 : index].replace('{name}', name);
}
