// Rete degli obiettivi: funzioni pure su PersonalGoal[] con parent_ids dal backend.
// Il backend rifiuta i cicli; qui li si evita comunque per non bloccare la pagina.
import type { PersonalGoal } from './goals';

export type TreeNode = { key: string; goal: PersonalGoal; depth: number; repeat: boolean; otherParents: PersonalGoal[]; children: TreeNode[] };

const closed = (goal: PersonalGoal) => goal.status === 'completed' || goal.status === 'archived';

export function compareGoals(a: PersonalGoal, b: PersonalGoal): number {
    return a.priority - b.priority || (a.review_date ?? '9999').localeCompare(b.review_date ?? '9999') || b.id - a.id;
}

function index(goals: PersonalGoal[]) {
    const byId = new Map(goals.map(goal => [goal.id, goal]));
    const children = new Map<number, PersonalGoal[]>();
    for (const goal of goals) for (const parent of goal.parent_ids) if (byId.has(parent)) children.set(parent, [...(children.get(parent) ?? []), goal]);
    for (const list of children.values()) list.sort(compareGoals);
    return { byId, children };
}

function walk(start: number[], next: (id: number) => number[]): Set<number> {
    const seen = new Set<number>(); const stack = [...start];
    while (stack.length) for (const id of next(stack.pop()!)) if (!seen.has(id)) { seen.add(id); stack.push(id); }
    return seen;
}

export function descendants(goals: PersonalGoal[], id: number): Set<number> {
    const { children } = index(goals);
    return walk([id], n => (children.get(n) ?? []).map(goal => goal.id));
}

export function ancestors(goals: PersonalGoal[], id: number): Set<number> {
    const { byId } = index(goals);
    return walk([id], n => (byId.get(n)?.parent_ids ?? []).filter(p => byId.has(p)));
}

export function wouldCycle(goals: PersonalGoal[], childId: number, parentId: number): boolean {
    return childId === parentId || descendants(goals, childId).has(parentId);
}

/** Groups that see a goal: its own share or any ancestor's. Maps group → goal that grants it. */
export function effectiveShares(goals: PersonalGoal[], id: number): Map<number, PersonalGoal> {
    const { byId } = index(goals); const result = new Map<number, PersonalGoal>();
    for (const goalId of [id, ...ancestors(goals, id)]) {
        const goal = byId.get(goalId);
        if (goal?.shared_group_id && !result.has(goal.shared_group_id)) result.set(goal.shared_group_id, goal);
    }
    return result;
}

export function progress(goals: PersonalGoal[], id: number): { done: number; total: number } {
    const children = index(goals).children.get(id) ?? [];
    return { done: children.filter(goal => goal.status === 'completed').length, total: children.length };
}

/** Groups gained or lost by `ids` and their descendants when the network changes from `before` to `after`. */
export function visibilityDelta(before: PersonalGoal[], after: PersonalGoal[], ids: number[]): { gained: number[]; lost: number[] } {
    const scope = new Set(ids.flatMap(id => [id, ...descendants(before, id), ...descendants(after, id)]));
    const groups = (goals: PersonalGoal[], id: number) => new Set(goals.some(goal => goal.id === id) ? effectiveShares(goals, id).keys() : []);
    const gained = new Set<number>(); const lost = new Set<number>();
    for (const id of scope) {
        const was = groups(before, id); const now = groups(after, id);
        now.forEach(group => { if (!was.has(group)) gained.add(group); });
        was.forEach(group => { if (!now.has(group)) lost.add(group); });
    }
    const sorted = (set: Set<number>) => [...set].sort((a, b) => a - b);
    return { gained: sorted(gained), lost: sorted(lost) };
}

/** Closed goals stay visible while they lead to open work, so no open goal loses its place. */
export function visibleGoals(goals: PersonalGoal[], showClosed: boolean): PersonalGoal[] {
    if (showClosed) return goals;
    const { byId } = index(goals);
    const open = goals.filter(goal => !closed(goal)).map(goal => goal.id);
    const keep = new Set([...open, ...walk(open, n => (byId.get(n)?.parent_ids ?? []).filter(p => byId.has(p)))]);
    return goals.filter(goal => keep.has(goal.id));
}

export function buildForest(goals: PersonalGoal[], showClosed: boolean): TreeNode[] {
    const shown = visibleGoals(goals, showClosed);
    const { byId, children } = index(shown);
    const seen = new Set<number>();
    const build = (goal: PersonalGoal, depth: number, key: string, parentId: number | null, path: Set<number>): TreeNode => {
        const repeat = seen.has(goal.id); seen.add(goal.id);
        const otherParents = goal.parent_ids.filter(p => p !== parentId && byId.has(p)).map(p => byId.get(p)!);
        const next = (children.get(goal.id) ?? []).filter(child => !path.has(child.id));
        return { key, goal, depth, repeat, otherParents, children: next.map(child => build(child, depth + 1, `${key}/${child.id}`, goal.id, new Set([...path, child.id]))) };
    };
    return shown.filter(goal => !goal.parent_ids.some(p => byId.has(p))).sort(compareGoals)
        .map(goal => build(goal, 0, String(goal.id), null, new Set([goal.id])));
}

/** Teacher view: each shared goal once, depth-first under its first visible parent. */
export function orderBranches<T extends { id: number; parent_ids: number[] }>(rows: T[]): { row: T; depth: number }[] {
    const ids = new Set(rows.map(row => row.id)); const seen = new Set<number>(); const result: { row: T; depth: number }[] = [];
    const visit = (row: T, depth: number) => {
        if (seen.has(row.id)) return; seen.add(row.id); result.push({ row, depth });
        rows.filter(child => child.parent_ids.find(p => ids.has(p)) === row.id).forEach(child => visit(child, depth + 1));
    };
    rows.filter(row => !row.parent_ids.some(p => ids.has(p))).forEach(row => visit(row, 0));
    return result;
}
