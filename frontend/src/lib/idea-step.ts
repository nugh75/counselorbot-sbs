// Che cosa tocca adesso, in una riga. Il server lo calcola a ogni turno
// (`next_move`) ma finora arrivava a schermo solo come elenco di ruoli
// mancanti: il motivo, che e' la parte che orienta, restava dentro i dati.

import type { IdeaNextStep, IdeaRole } from './idea-map';

export interface StepLine {
    key: string;
    // Uno dei due, secondo il motivo: un ruolo da tradurre o un testo che il
    // server ha gia' messo nella lingua della sessione.
    role?: IdeaRole;
    text?: string;
}

export function stepLine(move: IdeaNextStep | null): StepLine | null {
    if (!move) return null;
    switch (move.reason) {
        case 'no-map':
            return { key: 'idea.step.noMap' };
        case 'task-unknown':
            return { key: 'idea.step.taskUnknown' };
        case 'flaw':
            return { key: 'idea.step.flaw', text: move.reason_text };
        case 'missing-role':
            return { key: 'idea.step.missingRole', role: move.role as IdeaRole };
        case 'ready-to-close':
            return { key: 'idea.step.readyToClose', text: move.pivot };
        case 'all-closed':
            return { key: 'idea.step.allClosed' };
        default:
            return null;
    }
}
