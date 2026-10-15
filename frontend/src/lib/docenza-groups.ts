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
