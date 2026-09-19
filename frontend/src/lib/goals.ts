import { apiFetch } from './auth';
export type ResourceKind = 'action' | 'event' | 'portfolio' | 'booklet' | 'tavolo' | 'notebook' | 'card' | 'comparison';
export type GoalResource = { kind: ResourceKind; target_id: string; title: string; href: string | null; available: boolean; stage?: string; date?: string; id?: number };
export type CatalogData = { title: string; description: string; area: string; audience: string; criteria: string; suggestions: string; language: string };
export type CatalogEntry = { id: number; author_username: string; group_id: number | null; status: string; version: number; data: CatalogData };
export type GoalFields = { title: string; motivation: string; criteria: string; reflection: string; status: string; priority: number; review_date: string | null; shared_group_id: number | null; revision: number };
export type PersonalGoal = GoalFields & { id: number; catalog_id: number | null; catalog_snapshot: { version?: number; data?: CatalogData }; links: GoalResource[] };
export type GoalGroup = { id: number; name: string };
export const blankGoal: GoalFields = { title: '', motivation: '', criteria: '', reflection: '', status: 'active', priority: 2, review_date: null, shared_group_id: null, revision: 0 };
export const goalFields = (goal: GoalFields): GoalFields => ({ title: goal.title, motivation: goal.motivation, criteria: goal.criteria, reflection: goal.reflection, status: goal.status, priority: goal.priority, review_date: goal.review_date, shared_group_id: goal.shared_group_id, revision: goal.revision });
export class GoalError extends Error { constructor(public status: number) { super(String(status)); } }
export async function goalApi<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await apiFetch(`/api${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new GoalError(response.status);
    return await response.json() as T;
}
