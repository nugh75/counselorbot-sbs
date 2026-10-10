// #174: personal tools an activity (assignment) asks the student to open, in a
// popup inside the activity or at full page. Mirrors backend ACTIVITY_TOOL_KEYS.
export const ACTIVITY_TOOLS = ['tavolo', 'goals', 'actions', 'timeline', 'portfolio', 'pqbl', 'flashcards', 'cards',
    'comparison', 'bussola', 'assistant'];

const HREFS: Record<string, string> = {
    tavolo: '/profilo/tavolo', goals: '/profilo/obiettivi', actions: '/profilo/azioni', timeline: '/profilo/timeline',
    portfolio: '/profilo/portfolio', pqbl: '/profilo/pqbl', flashcards: '/profilo/flashcard', cards: '/profilo/carte',
    comparison: '/profilo/confronto', bussola: '/bussola', assistant: '/assistente',
};

export interface ActivityTool { key: string; available: boolean }

/** The tool page; `embedded` hides the site header when the page opens inside the popup. */
export function activityToolHref(key: string, embedded = false): string {
    const href = HREFS[key] ?? '/profilo';
    return embedded ? `${href}?embedded=1` : href;
}

export function parseActivityTools(input: unknown): ActivityTool[] {
    if (!Array.isArray(input)) return [];
    return input.flatMap(item => {
        const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
        return ACTIVITY_TOOLS.includes(String(row.key)) ? [{ key: String(row.key), available: row.available !== false }] : [];
    });
}
