// Liste della rilettura di una tappa («Cosa ha funzionato», «Cosa non ha funzionato»):
// una voce per riga. Il testo digitato resta com'è finché dice la stessa lista, così
// uno spazio o un a capo in fondo non spariscono mentre si scrive.
export const linesOf = (text: string): string[] => text.split('\n').map(item => item.trim()).filter(Boolean).slice(0, 10);

export function draftFor(draft: string, items: string[]): string {
    const same = linesOf(draft);
    return same.length === items.length && same.every((item, index) => item === items[index]) ? draft : items.join('\n');
}
