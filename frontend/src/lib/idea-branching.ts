// Quali comandi ha senso offrire su un ramo. Il server rifiuta comunque cio'
// che non si puo' fare: qui si evita di offrirlo, che e' un'altra cosa.

import type { IdeaBranch } from './idea-map';

// Idea -> ramo -> sotto-ramo, e basta: sotto non e' piu' messa a fuoco.
export const MAX_BRANCH_DEPTH = 2;

export interface BranchCommands {
    up: boolean;
    down: boolean;
    indent: boolean;
    outdent: boolean;
    remove: boolean;
    restore: boolean;
}

const NONE: BranchCommands = {
    up: false, down: false, indent: false, outdent: false, remove: false, restore: false,
};

// Quanto scende il ramo piu' profondo appeso a questo, contando da lui.
function reach(rows: IdeaBranch[], id: string): number {
    const children = rows.filter((row) => row.parent === id && !row.demoted);
    if (children.length === 0) return 0;
    return 1 + Math.max(...children.map((child) => reach(rows, child.id)));
}

export function branchCommands(rows: IdeaBranch[], id: string): BranchCommands {
    const row = rows.find((item) => item.id === id);
    // La radice e' la mappa: spostarla o cancellarla non vuol dire niente.
    if (!row || row.parent === null) return NONE;

    const siblings = rows.filter((item) => item.parent === row.parent);
    const here = siblings.findIndex((item) => item.id === id);
    const above = here > 0 ? siblings[here - 1] : null;
    const parent = rows.find((item) => item.id === row.parent);

    return {
        up: here > 0,
        down: here >= 0 && here < siblings.length - 1,
        indent: !row.demoted && above !== null && !above.demoted
            && row.depth + 1 + reach(rows, id) <= MAX_BRANCH_DEPTH,
        outdent: !row.demoted && parent !== undefined && parent.parent !== null,
        remove: true,
        restore: row.demoted && row.depth + 1 <= MAX_BRANCH_DEPTH,
    };
}
