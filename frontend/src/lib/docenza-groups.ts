// Classi della chat docenza (OBIETTIVO_DOCENZA): quali id usa la sessione e
// quando entrano davvero nel contesto. Gli id non sono un permesso: il server
// riverifica a ogni turno classi attive proprie o condivise.

import type { NotebookContextChoice } from './notebook-context';

// Ripresa di una sessione congelata: vale la selezione salvata con lei (vuota
// per gli snapshot precedenti), mai la preferenza del browser o di un'altra
// chat. Una chat nuova parte dalla preferenza del browser, visibile nella barra.
export function initialDocenzaGroupIds(
    snapshot: { session_id: string; group_ids?: number[] | null } | null | undefined,
    sessionId: string,
    readStored: () => number[],
): number[] {
    if (snapshot && snapshot.session_id === sessionId) return snapshot.group_ids ?? [];
    return readStored();
}

// Le classi entrano solo con il taccuino docente, che nella docenza è anche
// il default del server: "default" non viaggia e il backend lo risolve così.
export function docenzaClassesInContext(choice: NotebookContextChoice): boolean {
    return choice === 'teacher' || choice === 'default';
}

// Destinatari della chat docenza oltre alle classi (#903): studenti delle
// classi del docente e suoi studenti di prova, scelti prima della chat.
// Come le classi, il server li riverifica a ogni salvataggio dello snapshot.
export interface DocenzaTargetStudent { group_id: number; username: string }
export interface DocenzaTargets { students: DocenzaTargetStudent[]; practiceIds: number[] }

export const NO_DOCENZA_TARGETS: DocenzaTargets = { students: [], practiceIds: [] };

// Stessa regola delle classi: la ripresa usa i destinatari della sessione
// (nessuno per gli snapshot precedenti), una chat nuova quelli appena scelti.
export function initialDocenzaTargets(
    snapshot: { session_id: string; target_students?: DocenzaTargetStudent[] | null; target_practice_notebook_ids?: number[] | null } | null | undefined,
    sessionId: string,
    readStored: () => DocenzaTargets,
): DocenzaTargets {
    if (snapshot && snapshot.session_id === sessionId) {
        return { students: snapshot.target_students ?? [], practiceIds: snapshot.target_practice_notebook_ids ?? [] };
    }
    return readStored();
}

// L'obiettivo è sempre per qualcuno: almeno una classe, uno studente o uno studente di prova.
export function hasDocenzaTarget(groupIds: number[], targets: DocenzaTargets): boolean {
    return groupIds.length + targets.students.length + targets.practiceIds.length > 0;
}

export function toggleDocenzaStudent(students: DocenzaTargetStudent[], target: DocenzaTargetStudent): DocenzaTargetStudent[] {
    const same = (row: DocenzaTargetStudent) => row.group_id === target.group_id && row.username === target.username;
    return students.some(same) ? students.filter((row) => !same(row)) : [...students, target];
}
