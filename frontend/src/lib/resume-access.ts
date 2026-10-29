// Filtro di accesso sulle voci "Riprendi" (N7): una voce compare solo se la
// classe/vista attiva consente lo strumento, perché proseguire è una scrittura
// che il server rifiuta. Il filtro nasconde soltanto: i dati locali restano.
// Accesso null (non caricato o errore) non filtra: il server resta la guardia.

import type { FrozenSessionSummary } from './frozen-session';
import type { ResumePoint } from './resume';
// @ts-expect-error -- Node's direct TypeScript runner requires the extension.
import { isClassContentHidden, isToolAllowed, type UserAccess } from './user-access.ts';

export interface AllowedResumeEntries {
    frozen: FrozenSessionSummary[];
    localResume: ResumePoint | null;
    pqbl: boolean;
    count: number;
}

export function allowedResumeEntries(
    access: UserAccess | null | undefined,
    entries: { frozen: FrozenSessionSummary[]; localResume: ResumePoint | null; pqbl: boolean },
): AllowedResumeEntries {
    const frozen = entries.frozen.filter((row) => isToolAllowed(access, row.questionnaire_type)
        && !(row.path_id && isClassContentHidden(access)));
    const localResume = entries.localResume && isToolAllowed(access, entries.localResume.instrument)
        && !frozen.some(row => row.session_id === entries.localResume?.sessionId)
        ? entries.localResume
        : null;
    const pqbl = entries.pqbl && isToolAllowed(access, 'pqbl');
    return { frozen, localResume, pqbl, count: frozen.length + (localResume ? 1 : 0) + (pqbl ? 1 : 0) };
}
