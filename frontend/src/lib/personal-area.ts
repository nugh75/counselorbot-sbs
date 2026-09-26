import type { PersonalGoal } from './goals';

export const personalAreaGroups = [
    { id: 'journey', slugs: ['obiettivi', 'azioni', 'timeline'] },
    { id: 'reflection', slugs: ['taccuino', 'cambiamenti', 'compilazioni', 'analisi-combinata'] },
    { id: 'study', slugs: ['pqbl', 'flashcard', 'carte', 'confronto', 'tavolo'] },
    { id: 'works', slugs: ['portfolio'] },
    { id: 'support', slugs: ['assegnazioni', 'classi', 'orientamento', 'telegram'] },
] as const;

export const personalAreaImages = {
    'analisi-combinata': '/images/intro/profiles.png',
    obiettivi: '/images/cards/focus_goal.png',
    azioni: '/images/platform/bacheca-azioni.png',
    timeline: '/images/platform/linea-del-tempo.png',
    taccuino: '/images/platform/su-di-me.png',
    cambiamenti: '/images/cards/self_reflection.png',
    compilazioni: '/images/platform/compilazioni.png',
    pqbl: '/images/intro/practice.png',
    flashcard: '/images/cards/feedback_loop.png',
    carte: '/images/platform/carte-ordinare.png',
    confronto: '/images/platform/confronto.png',
    tavolo: '/images/platform/tavolo.png',
    portfolio: '/images/platform/portfolio.png',
    assegnazioni: '/images/platform/assegnazioni.png',
    classi: '/images/platform/classi.png',
    orientamento: '/images/platform/bussola.png',
    telegram: '/images/platform/telegram.png',
} as const;
export type PersonalAreaSlug = keyof typeof personalAreaImages;
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
