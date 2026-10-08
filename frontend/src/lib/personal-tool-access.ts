import type { PersonalAreaSlug, ResumeItem } from './personal-area';

// Personal-area pages that a class can turn off (#91). Keys match
// backend/class_tools.py PERSONAL_TOOL_KEYS; slugs not listed here are always on.
export const personalToolBySlug = {
    obiettivi: 'goals',
    azioni: 'actions',
    timeline: 'timeline',
    portfolio: 'portfolio',
    pqbl: 'pqbl',
    flashcard: 'flashcards',
    carte: 'cards',
    confronto: 'comparison',
    tavolo: 'tavolo',
} as const satisfies Partial<Record<PersonalAreaSlug, string>>;

const resumeTool = { goal: 'goals', action: 'actions' } as const;

export interface UserAccess {
    restricted: boolean;
    tool_keys: string[];
}

export function parseUserAccess(payload: unknown): UserAccess {
    const row = payload as UserAccess | null;
    if (!row || typeof row.restricted !== 'boolean' || !Array.isArray(row.tool_keys)
        || !row.tool_keys.every(key => typeof key === 'string')) {
        throw new Error('Invalid user access');
    }
    return { restricted: row.restricted, tool_keys: row.tool_keys };
}

// Unknown access (loading, failed read) shows the tool: the server still
// rejects writes, and hiding work on a network error would be worse.
export function personalSlugEnabled(access: UserAccess | null, slug: string): boolean {
    const key = personalToolBySlug[slug as keyof typeof personalToolBySlug];
    return !key || !access?.restricted || access.tool_keys.includes(key);
}

export function enabledResumeItems(items: ResumeItem[], access: UserAccess | null): ResumeItem[] {
    if (!access?.restricted) return items;
    return items.filter(item => item.kind === 'assignment' || access.tool_keys.includes(resumeTool[item.kind]));
}

export const personalToolAccessTexts = {
    disabledTitle: ['Strumento disattivato dalla tua classe', 'Tool turned off by your class', 'Herramienta desactivada por tu clase', 'Outil désactivé par ta classe', 'Werkzeug von deiner Klasse deaktiviert', 'Verktyget är avstängt av din klass'],
    disabledBody: [
        'Puoi rileggere ed esportare quello che hai già fatto, ma non salvare lavoro nuovo. Chiedi al tuo docente se ti serve.',
        'You can still read and export what you already made, but new work cannot be saved. Ask your teacher if you need it.',
        'Puedes releer y exportar lo que ya hiciste, pero no guardar trabajo nuevo. Pregunta a tu docente si lo necesitas.',
        'Tu peux relire et exporter ce que tu as déjà fait, mais pas enregistrer de nouveau travail. Demande à ton enseignant si tu en as besoin.',
        'Du kannst Vorhandenes weiter lesen und exportieren, aber keine neue Arbeit speichern. Frag deine Lehrkraft, wenn du es brauchst.',
        'Du kan fortfarande läsa och exportera det du redan har gjort, men inte spara nytt arbete. Fråga din lärare om du behöver det.',
    ],
} as const satisfies Record<string, readonly [string, string, string, string, string, string]>;

export function personalToolAccessText(lang: string, key: keyof typeof personalToolAccessTexts): string {
    const index = ['it', 'en', 'es', 'fr', 'de', 'sv'].indexOf(lang);
    return personalToolAccessTexts[key][index < 0 ? 1 : index];
}
