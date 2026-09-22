// Il catalogo d'immagini del tavolo, lato tela. I file stanno sul server, in
// un set caricato in blocco dall'amministrazione con il suo CSV di nome e
// utilizzo: il selettore filtra a video quello che arriva una volta per tela,
// come per le icone del catalogo dei diagrammi.

export interface TavoloImageEntry {
    id: string;
    name: string;
    usage: string;
}

export const BUILTIN_CARD_IMAGES: TavoloImageEntry[] = [
    { id: 'card:focus_goal', name: 'Obiettivo e Focus', usage: 'Bersaglio e ago bussola per obiettivi di studio' },
    { id: 'card:time_plan', name: 'Gestione del Tempo', usage: 'Clessidra e calendario per pianificazione' },
    { id: 'card:decision_path', name: 'Bivio e Decisione', usage: 'Strada a due vie per scelte e alternative' },
    { id: 'card:unravel_blocks', name: 'Sblocco e Procrastinazione', usage: 'Filo che si distende verso il primo passo' },
    { id: 'card:emotional_calm', name: 'Calma e Regolazione Emotiva', usage: 'Onde concentriche stile loto per gestire ansia' },
    { id: 'card:strengths_resource', name: 'Punti di Forza e Risorse', usage: 'Profilo con scintilla di consapevolezza interiore' },
    { id: 'card:action_steps', name: 'Piano d\'Azione e Traguardo', usage: 'Checklist con gradini e bandierina di traguardo' },
    { id: 'card:study_group', name: 'Studio di Gruppo e Confronto', usage: 'Due profili con libro per studio collaborativo' },
    { id: 'card:active_reading', name: 'Metodo di Studio e Appunti', usage: 'Libro aperto con note ed evidenziatore' },
    { id: 'card:recharge_pause', name: 'Pausa e Benessere', usage: 'Tazza calda, luna e batteria per ricaricare energie' },
    { id: 'card:critical_puzzle', name: 'Pensiero Critico e Sintesi', usage: 'Puzzle con tessera chiave per problem solving' },
    { id: 'card:feedback_loop', name: 'Feedback e Revisione', usage: 'Frecce cicliche attorno al foglio per miglioramento' },
    { id: 'card:curiosity_explore', name: 'Esplorazione e Orizzonti', usage: 'Cannocchiale puntato verso una stella' },
];

export const tavoloImageUrl = (id: string): string => {
    if (id.startsWith('/')) return id;
    if (id.startsWith('card:')) return `/images/cards/${id.slice(5)}.png`;
    return `/api/tavolo-images/${encodeURIComponent(id)}/file`;
};

const plain = (text: string) =>
    text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function matchTavoloImages(images: TavoloImageEntry[], query: string): TavoloImageEntry[] {
    const needle = plain(query.trim());
    if (!needle) return images;
    return images.filter((image) =>
        plain(image.name).includes(needle) || plain(image.usage).includes(needle));
}

export async function fetchTavoloImages(): Promise<TavoloImageEntry[]> {
    try {
        const response = await fetch('/api/tavolo-images');
        if (!response.ok) return BUILTIN_CARD_IMAGES;
        const body = await response.json() as { images?: TavoloImageEntry[] };
        const serverImages = Array.isArray(body.images) ? body.images : [];
        return [...BUILTIN_CARD_IMAGES, ...serverImages];
    } catch {
        return BUILTIN_CARD_IMAGES;
    }
}
