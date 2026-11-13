const texts = {
    label: ['Scegli la tua classe', 'Choose your class', 'Elige tu clase', 'Choisis ta classe', 'Wähle deine Klasse', 'Välj din klass'],
    all: ['Senza classe', 'No class', 'Sin clase', 'Sans classe', 'Ohne Klasse', 'Utan klass'],
    classes: ['Le mie classi', 'My classes', 'Mis clases', 'Mes classes', 'Meine Klassen', 'Mina klasser'],
    class: ['Classe {name}', 'Class {name}', 'Clase {name}', 'Classe {name}', 'Klasse {name}', 'Klass {name}'],
    classContentHidden: [
        'Per vedere i contenuti della classe, scegli una classe nel selettore Scegli la tua classe.',
        'To see class content, choose a class in the Choose your class selector.',
        'Para ver el contenido de la clase, elige una clase en el selector Elige tu clase.',
        'Pour voir le contenu de la classe, choisis une classe dans le sélecteur Choisis ta classe.',
        'Um Klasseninhalte zu sehen, wähle eine Klasse unter Wähle deine Klasse.',
        'För att se klassens innehåll, välj en klass under Välj din klass.',
    ],
    hint: [
        'La classe consiglia gli strumenti da usare: puoi scegliere Senza classe quando vuoi.',
        'Your class recommends which tools to use: you can choose No class at any time.',
        'Tu clase recomienda qué herramientas usar: puedes elegir Sin clase cuando quieras.',
        'Ta classe recommande les outils à utiliser : tu peux choisir Sans classe à tout moment.',
        'Deine Klasse empfiehlt, welche Werkzeuge du nutzt: Du kannst jederzeit Ohne Klasse wählen.',
        'Din klass rekommenderar vilka verktyg du använder: du kan välja Utan klass när du vill.',
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
