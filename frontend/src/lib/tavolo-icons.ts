// Le icone del catalogo, lato tela. Gli SVG stanno sul server e non nel bundle:
// sono cento, e la stessa fonte serve a Graphviz, alla tela e alla cattura.

export interface IconEntry {
    id: string;
    meaning: string;
    label: string;
}

export const iconUrl = (id: string): string => `/api/diagram-icons/${encodeURIComponent(id)}.svg`;

const plain = (text: string) =>
    text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function matchIcons(icons: IconEntry[], query: string): IconEntry[] {
    const needle = plain(query.trim());
    if (!needle) return icons;
    return icons.filter((icon) =>
        plain(icon.label).includes(needle)
        || plain(icon.meaning).includes(needle)
        || icon.id.includes(needle));
}

export async function fetchIcons(lang: string): Promise<IconEntry[]> {
    const response = await fetch(`/api/diagram-icons?lang=${encodeURIComponent(lang)}`);
    if (!response.ok) return [];
    const body = await response.json() as { icons: IconEntry[] };
    return body.icons;
}
