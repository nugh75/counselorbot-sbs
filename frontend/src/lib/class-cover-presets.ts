/**
 * Preset e utilità per le copertine 16:9 delle classi in stile counselor.
 */

export interface ClassCoverPreset {
    id: string;
    labelKey: string;
    url: string;
    themePrompt: string;
}

export const CLASS_COVER_PRESETS: readonly ClassCoverPreset[] = [
    {
        id: 'science',
        labelKey: 'coverScience',
        url: '/images/classes/class-science.svg',
        themePrompt: 'scienze naturali, laboratorio chimico e biologico con microscopio e reticolo molecolare',
    },
    {
        id: 'space',
        labelKey: 'coverSpace',
        url: '/images/classes/class-space.svg',
        themePrompt: 'astronomia, fisica spaziale, telescopio verso pianeti con anelli e costellazioni',
    },
    {
        id: 'humanities',
        labelKey: 'coverHumanities',
        url: '/images/classes/class-humanities.svg',
        themePrompt: 'storia, lettere e filosofia classica con tomi rilegati, pergamena e colonna ionica',
    },
    {
        id: 'arts',
        labelKey: 'coverArts',
        url: '/images/classes/class-arts.svg',
        themePrompt: 'arti visive, pittura e design con cavalletto, tavolozza colori e forme geometriche',
    },
    {
        id: 'tech',
        labelKey: 'coverTech',
        url: '/images/classes/class-tech.svg',
        themePrompt: 'tecnologia, informatica e ingegneria con microchip, tracce circuitali in ottone e impulsi logici',
    },
    {
        id: 'nature',
        labelKey: 'coverNature',
        url: '/images/classes/class-nature.svg',
        themePrompt: 'ecologia, botanica e scienze ambientali con germoglio vitale e chioma arborea stilizzata',
    },
    {
        id: 'math',
        labelKey: 'coverMath',
        url: '/images/classes/class-math.svg',
        themePrompt: 'matematica, geometria pura e logica con compasso aureo, icosaedro e spirale di Fibonacci',
    },
    {
        id: 'music',
        labelKey: 'coverMusic',
        url: '/images/classes/class-music.svg',
        themePrompt: 'musica, armonia e acustica con onde sinusoidali, diapason risonante e note armoniche',
    },
    {
        id: 'sports',
        labelKey: 'coverSports',
        url: '/images/classes/class-sports.svg',
        themePrompt: 'scienze motorie, atletica ed educazione fisica con pista prospettica e fiaccola dinamica',
    },
    {
        id: 'geography',
        labelKey: 'coverGeography',
        url: '/images/classes/class-geography.svg',
        themePrompt: 'geografia, scienze della terra e orientamento con mappamondo nautico e rosa dei venti',
    },
];

/**
 * Calcola un hash deterministico stringa per associare stabilmente una copertina predefinita
 * a ogni classe anche in assenza di personalizzazione esplicita.
 */
function hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

/**
 * Restituisce l'URL della copertina per una classe.
 * Se la classe possiede un image_url valido lo restituisce direttamente,
 * altrimenti seleziona deterministicamente uno dei 10 preset armoniosi basandosi su id e nome.
 */
export function getClassCoverUrl(group?: { id?: number | null; name?: string | null; image_url?: string | null } | null): string {
    if (group?.image_url && group.image_url.trim()) {
        return group.image_url.trim();
    }
    const seed = `${group?.id ?? ''}_${group?.name ?? 'classe'}`;
    const index = hashString(seed) % CLASS_COVER_PRESETS.length;
    return CLASS_COVER_PRESETS[index].url;
}

/**
 * Compone un prompt per intelligenza artificiale (ChatGPT / Gemini / Imagen / DALL-E)
 * ottimizzato per generare copertine orizzontali 16:9 coerenti con lo stile CounselorBot.
 */
export function composeClassCoverAIPrompt(groupName?: string, context?: string): string {
    const classContext = groupName ? `'${groupName}'` : 'una classe scolastica';
    const detail = context && context.trim() ? ` a tema ${context.trim()}` : '';
    return `Crea una copertina rettangolare orizzontale in formato 16:9 per una classe scolastica di ${classContext}${detail}. Stile: illustrazione vettoriale concettuale ed elegante, sfondo con gradiente profondo nei toni verde petrolio (#042f2e / #0f766e) e blu notte, con elementi simbolici raffinati in primo piano (toni caldi di ambra, ottone e ciano). Composizione orizzontale pulita, senza figure umane realistiche, senza assolutamente alcun testo, scritte o lettere.`;
}
