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
        themePrompt: 'natural sciences, chemistry and biology lab with a microscope and a molecular lattice',
    },
    {
        id: 'space',
        labelKey: 'coverSpace',
        url: '/images/classes/class-space.svg',
        themePrompt: 'astronomy, space physics, telescope pointed at ringed planets and constellations',
    },
    {
        id: 'humanities',
        labelKey: 'coverHumanities',
        url: '/images/classes/class-humanities.svg',
        themePrompt: 'history, literature and classical philosophy with bound volumes, parchment and an Ionic column',
    },
    {
        id: 'arts',
        labelKey: 'coverArts',
        url: '/images/classes/class-arts.svg',
        themePrompt: 'visual arts, painting and design with an easel, a colour palette and geometric shapes',
    },
    {
        id: 'tech',
        labelKey: 'coverTech',
        url: '/images/classes/class-tech.svg',
        themePrompt: 'technology, computer science and engineering with a microchip, brass circuit traces and logic pulses',
    },
    {
        id: 'nature',
        labelKey: 'coverNature',
        url: '/images/classes/class-nature.svg',
        themePrompt: 'ecology, botany and environmental science with a thriving sprout and a stylized tree canopy',
    },
    {
        id: 'math',
        labelKey: 'coverMath',
        url: '/images/classes/class-math.svg',
        themePrompt: 'mathematics, pure geometry and logic with a golden compass, an icosahedron and a Fibonacci spiral',
    },
    {
        id: 'music',
        labelKey: 'coverMusic',
        url: '/images/classes/class-music.svg',
        themePrompt: 'music, harmony and acoustics with sine waves, a resonating tuning fork and harmonic notes',
    },
    {
        id: 'sports',
        labelKey: 'coverSports',
        url: '/images/classes/class-sports.svg',
        themePrompt: 'movement science, athletics and physical education with a perspective track and a dynamic torch',
    },
    {
        id: 'geography',
        labelKey: 'coverGeography',
        url: '/images/classes/class-geography.svg',
        themePrompt: 'geography, earth science and orientation with a nautical globe and a compass rose',
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
    const classContext = groupName ? `'${groupName}'` : 'a school class';
    const detail = context && context.trim() ? ` themed around ${context.trim()}` : '';
    return `Create a rectangular horizontal cover in 16:9 format for a school class of ${classContext}${detail}. Style: conceptual and elegant vector illustration, background with a deep gradient in petrol green (#042f2e / #0f766e) and night blue tones, with refined symbolic elements in the foreground (warm shades of amber, brass and cyan). Clean horizontal composition, no realistic human figures, absolutely no text, writing or letters.`;
}
