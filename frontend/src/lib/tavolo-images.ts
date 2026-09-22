// Il catalogo d'immagini del tavolo, lato tela. I file stanno sul server, in
// un set caricato in blocco dall'amministrazione con il suo CSV di nome e
// utilizzo: il selettore filtra a video quello che arriva una volta per tela,
// come per le icone del catalogo dei diagrammi.

export interface TavoloImageEntry {
    id: string;
    name: string;
    usage: string;
}

export const tavoloImageUrl = (id: string): string =>
    `/api/tavolo-images/${encodeURIComponent(id)}/file`;

const plain = (text: string) =>
    text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function matchTavoloImages(images: TavoloImageEntry[], query: string): TavoloImageEntry[] {
    const needle = plain(query.trim());
    if (!needle) return images;
    return images.filter((image) =>
        plain(image.name).includes(needle) || plain(image.usage).includes(needle));
}

export async function fetchTavoloImages(): Promise<TavoloImageEntry[]> {
    const response = await fetch('/api/tavolo-images');
    if (!response.ok) return [];
    const body = await response.json() as { images?: TavoloImageEntry[] };
    return Array.isArray(body.images) ? body.images : [];
}
