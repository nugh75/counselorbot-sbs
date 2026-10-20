export interface Exploration {
    id: string;
    title: string;
    origin_phase: string;
    origin_label?: string | null;
}

export interface ExplorationEvent extends Exploration {
    action: 'open' | 'stay' | 'return';
}

export interface GuidedCheckpoint {
    draft: string;
    scroll_top: number;
    user_messages: number;
    advance_suggestion: boolean;
}

export interface GuidedNavigation {
    visited: string[];
    completed: string[];
    agreement_accepted: boolean;
    active_exploration_id: string | null;
    explorations: (Exploration & { checkpoint: GuidedCheckpoint })[];
    checkpoints: Record<string, GuidedCheckpoint>;
}

export const emptyCheckpoint = (): GuidedCheckpoint => ({ draft: '', scroll_top: 0, user_messages: 0, advance_suggestion: false });
export const emptyNavigation = (): GuidedNavigation => ({ visited: [], completed: [], agreement_accepted: false, active_exploration_id: null, explorations: [], checkpoints: {} });

export function canSelectPhase(phases: readonly string[], target: string, agreement: string | undefined, accepted: boolean): boolean {
    return phases.includes(target) && (!agreement || accepted || phases.indexOf(target) <= phases.indexOf(agreement));
}

export function explorationPayload(exploration?: Exploration): Exploration | undefined {
    return exploration ? { id: exploration.id, title: exploration.title, origin_phase: exploration.origin_phase, ...(exploration.origin_label ? { origin_label: exploration.origin_label } : {}) } : undefined;
}
