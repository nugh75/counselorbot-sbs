// Client HTTP dei taccuini di prova del docente (vedi practice-notebooks.ts).

import { apiFetch } from '@/lib/auth';
import { parsePracticeNotebooks, practiceNotebookBody, type PracticeNotebook, type PracticeNotebookData } from '@/lib/practice-notebooks';

const BASE = '/api/teacher/practice-notebooks';

async function json<T>(response: Response): Promise<T> {
    if (!response.ok) throw new Error(`practice notebooks ${response.status}`);
    return response.json() as Promise<T>;
}

export const practiceNotebookApi = {
    async list(includeArchived = false, signal?: AbortSignal): Promise<PracticeNotebook[]> {
        const response = await apiFetch(`${BASE}${includeArchived ? '?include_archived=true' : ''}`, { signal });
        return parsePracticeNotebooks(await json<unknown>(response));
    },
    async create(title: string, values: PracticeNotebookData, groupIds: number[] = []): Promise<PracticeNotebook> {
        return json(await apiFetch(BASE, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...practiceNotebookBody(title, values), group_ids: groupIds }),
        }));
    },
    async update(id: number, patch: { title?: string; values?: PracticeNotebookData; groupIds?: number[]; archived?: boolean }): Promise<PracticeNotebook> {
        const body: Record<string, unknown> = {};
        if (patch.title !== undefined || patch.values !== undefined) {
            const clean = practiceNotebookBody(patch.title ?? '', patch.values ?? {});
            if (patch.title !== undefined) body.title = clean.title;
            if (patch.values !== undefined) body.data = clean.data;
        }
        if (patch.groupIds !== undefined) body.group_ids = patch.groupIds;
        if (patch.archived !== undefined) body.archived = patch.archived;
        return json(await apiFetch(`${BASE}/${id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        }));
    },
    async remove(id: number): Promise<void> {
        await json(await apiFetch(`${BASE}/${id}`, { method: 'DELETE' }));
    },
};
