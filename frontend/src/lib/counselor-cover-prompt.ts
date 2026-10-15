/**
 * Generatore di prompt IA ottimizzati per le copertine 16:9 dei counselor
 * in stile visivo concettuale CounselorBot (Issue #288).
 */

export interface CounselorCoverPromptOptions {
    name?: string | null;
    persona?: string | null;
    description?: string | null;
    metaphor?: string | null;
    approach?: string | null;
}

export interface CounselorMetaphorPreset {
    id: string;
    label: string;
    themePrompt: string;
}

export const COUNSELOR_METAPHOR_PRESETS: readonly CounselorMetaphorPreset[] = [
    {
        id: 'explorer',
        label: 'Esploratore & Cannocchiale',
        themePrompt: 'orientamento, rotta, cartografia stellare e cannocchiale nautico',
    },
    {
        id: 'lighthouse',
        label: 'Faro & Orizzonte',
        themePrompt: 'faro costiero su scogliera, raggio di luce nella notte e mare calmo',
    },
    {
        id: 'workshop',
        label: 'Officina & Precisione',
        themePrompt: 'officina artigiana, calibro, ingranaggi e rigore operativo',
    },
    {
        id: 'journalism',
        label: 'Giornalismo & Domande maieutiche',
        themePrompt: 'taccuino d’inchiostro, lente di ingrandimento e domande maieutiche',
    },
    {
        id: 'mountain-guide',
        label: 'Guida alpina & Sentiero',
        themePrompt: 'vetta montuosa stilizzata, sentiero alpino, bussola e mappa topografica',
    },
    {
        id: 'architecture',
        label: 'Architettura & Moduli',
        themePrompt: 'strutture geometriche modulari, travi eleganti e progetto isometrico',
    },
    {
        id: 'lutherie',
        label: 'Liuteria & Armonia',
        themePrompt: 'corde armoniche, tavola armonica di liuto e onde sonore fluide',
    },
    {
        id: 'kintsugi',
        label: 'Ceramica & Kintsugi',
        themePrompt: 'vaso in ceramica con venature dorate kintsugi e composizione zen',
    },
    {
        id: 'horology',
        label: 'Orologeria & Ritmo interiore',
        themePrompt: 'rotismi di pendolo, bilanciere d’orologio e scansione armoniosa del tempo',
    },
    {
        id: 'prism',
        label: 'Prisma & Sintesi',
        themePrompt: 'prisma ottico che rifrange un fascio di luce bianca in sfumature ciano e ambra',
    },
    {
        id: 'compass',
        label: 'Rosa dei venti & Direzione',
        themePrompt: 'bussola magnetica d’ottone, meridiani e coordinate di viaggio',
    },
    {
        id: 'alchemy',
        label: 'Alchimia & Consapevolezza',
        themePrompt: 'crogiolo alchemico, elementi in trasformazione e scintille di consapevolezza',
    },
];

/**
 * Compone un prompt per intelligenza artificiale (ChatGPT / Gemini / Imagen / DALL-E)
 * ottimizzato per generare copertine orizzontali 16:9 dei counselor coerenti
 * con le linee guida visive di CounselorBot.
 */
export function composeCounselorCoverAIPrompt(options: CounselorCoverPromptOptions = {}): string {
    const counselorName = options.name?.trim() || 'Counselor';
    const effectiveApproach =
        options.approach?.trim() ||
        options.description?.trim() ||
        options.persona?.trim() ||
        'orientamento maieutico e riflessivo';
    const effectiveMetaphor = options.metaphor?.trim() || 'bussola e rotta verso il futuro';

    return `Crea una copertina rettangolare orizzontale in formato 16:9 per il counselor '${counselorName}' (approccio: ${effectiveApproach}, tema visivo: ${effectiveMetaphor}). Stile: illustrazione vettoriale concettuale ed elegante stile YouTube/CounselorBot, sfondo con gradiente profondo nei toni verde petrolio (#042f2e / #0f766e), indaco/blu notte (#1e1b4b / #312e81) e ardesia, con elementi simbolici raffinati in primo piano (accenti caldi in ambra #f59e0b, ottone dorato, ciano e menta). Composizione orizzontale pulita con soggetto focale iconico, senza figure umane realistiche né ritratti fotografici, senza assolutamente alcun testo, scritte o lettere.`;
}
