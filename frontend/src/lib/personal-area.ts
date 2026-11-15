import type { PersonalGoal } from './goals';
import type { AreaIllustrationId } from './tool-illustrations';

export const personalAreaGroups = [
    { id: 'reflection', slugs: ['piani-operativi', 'taccuino', 'cambiamenti', 'compilazioni', 'analisi-combinata'] },
    { id: 'journey', slugs: ['obiettivi', 'azioni', 'timeline'] },
    { id: 'study', slugs: ['pqbl', 'flashcard', 'carte', 'confronto', 'tavolo'] },
    { id: 'works', slugs: ['portfolio'] },
    { id: 'support', slugs: ['assegnazioni', 'classi', 'orientamento', 'telegram'] },
] as const;

export const personalAreaIllustrations = {
    'piani-operativi': 'area-plan',
    'analisi-combinata': 'area-combined',
    obiettivi: 'area-goal',
    azioni: 'area-actions',
    timeline: 'area-timeline',
    taccuino: 'area-notebook',
    cambiamenti: 'area-changes',
    compilazioni: 'area-responses',
    pqbl: 'area-quiz',
    flashcard: 'area-flashcards',
    carte: 'area-sort-cards',
    confronto: 'area-compare',
    tavolo: 'area-table',
    portfolio: 'area-portfolio',
    assegnazioni: 'area-assignments',
    classi: 'area-classes',
    orientamento: 'area-compass',
    telegram: 'area-chat',
} as const satisfies Record<string, AreaIllustrationId>;
export type PersonalAreaSlug = keyof typeof personalAreaIllustrations;
export type ResumeAssignment = {
    id: number; snapshot: { title: string }; due_date: string | null;
    progress?: { planned: boolean; shared: boolean; feedback_available: boolean };
};
export type ResumeItem = { id: string; title: string; href: string; kind: 'goal' | 'action' | 'assignment'; date: string | null; feedback?: boolean };

// A single bounded list, based only on existing work and explicit dates.
export function personalResumeItems(goals: PersonalGoal[], assignments: ResumeAssignment[]): ResumeItem[] {
    const items = new Map<string, ResumeItem>();
    for (const goal of goals.filter(g => g.status === 'active')) {
        const actions = goal.links.filter(link => link.kind === 'action' && link.available && link.stage !== 'done');
        if (!actions.length) items.set(`goal-${goal.id}`, { id: `goal-${goal.id}`, title: goal.title, href: `/profilo/obiettivi?goal=${goal.id}`, kind: 'goal', date: goal.review_date });
        for (const action of actions) items.set(`action-${action.target_id}`, {
            id: `action-${action.target_id}`, title: action.title,
            href: `/profilo/azioni#action-${encodeURIComponent(action.target_id)}`, kind: 'action', date: action.date || null,
        });
    }
    for (const assignment of assignments) {
        if (assignment.progress?.shared && !assignment.progress.feedback_available) continue;
        items.set(`assignment-${assignment.id}`, { id: `assignment-${assignment.id}`, title: assignment.snapshot.title,
            href: `/profilo/assegnazioni#assignment-${assignment.id}`, kind: 'assignment', date: assignment.due_date,
            feedback: assignment.progress?.feedback_available });
    }
    return [...items.values()].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999') || a.id.localeCompare(b.id)).slice(0, 3);
}
