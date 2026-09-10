// I ruoli dei nodi della mappa. Stanno in un modulo loro perche' servono anche
// dove il client della mappa non puo' arrivare: e' un elenco, non una chiamata.

export const IDEA_ROLES = [
    'idea', 'assumption', 'evidence', 'alternative',
    'implication', 'open-question', 'constraint', 'step',
    'decision', 'task',
] as const;

export type IdeaRole = typeof IDEA_ROLES[number];

// Quelli che la persona puo' assegnare a mano. `idea` e' la radice della mappa
// e `task` e' un ramo: hanno porte loro, e aprirle da qui salterebbe il tipo di
// lavoro, che e' cio' che decide quando un ramo e' a fuoco.
export const EDITABLE_ROLES: IdeaRole[] = IDEA_ROLES.filter(
    (role): role is IdeaRole => role !== 'idea' && role !== 'task',
);
