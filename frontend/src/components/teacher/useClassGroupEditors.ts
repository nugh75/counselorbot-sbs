'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, getViewAsAccount } from '@/lib/auth';
import type { StudentGroup } from './class-group-types';

export interface ClassContextDraft {
    description: string;
    methodologies: string;
    visible: boolean;
}
type Write = { kind: 'context' } | { kind: 'level'; value: string } | { kind: 'institution'; value: string };
export interface ClassGroupEditorState {
    draft: ClassContextDraft;
    baseline: ClassContextDraft;
    dirty: boolean;
    busy: boolean;
    saved: boolean;
    failed: Write | null;
}
const contextOf = (group: StudentGroup): ClassContextDraft => ({ description: group.description ?? '', methodologies: group.methodologies ?? '', visible: group.context_visible_to_students });
const differs = (draft: ClassContextDraft, baseline: ClassContextDraft) => draft.description !== baseline.description || draft.methodologies !== baseline.methodologies || draft.visible !== baseline.visible;

// One owner of context drafts and existing PUTs, shared by the page and S14.
// Identity/permission/loading of the group list remain the caller's responsibility.
export function useClassGroupEditors(groups: StudentGroup[] | undefined, reloadGroups: () => void) {
    const [states, setStates] = useState<Record<number, ClassGroupEditorState>>({});
    const [forbidden, setForbidden] = useState(false);
    const currentStates = useRef<Record<number, ClassGroupEditorState>>({});
    const pending = useRef(new Map<number, AbortController>());
    const reloadRef = useRef(reloadGroups);
    useEffect(() => { reloadRef.current = reloadGroups; }, [reloadGroups]);
    const active = useRef(false);
    const account = useRef<string | undefined>(undefined);
    const versions = useRef<Record<number, number>>({});
    const readbacks = useRef(new Map<number, { context: ClassContextDraft; retryRequested: boolean }>());
    const publish = useCallback((next: Record<number, ClassGroupEditorState>) => { currentStates.current = next; setStates(next); }, []);
    const patch = useCallback((id: number, change: Partial<ClassGroupEditorState>) => {
        const state = currentStates.current[id];
        if (!state) return;
        publish({ ...currentStates.current, [id]: { ...state, ...change } });
    }, [publish]);

    useEffect(() => {
        active.current = true;
        account.current = getViewAsAccount()?.username;
        const requests = pending.current;
        return () => { active.current = false; for (const request of requests.values()) request.abort(); requests.clear(); };
    }, []);
    useEffect(() => {
        if (!groups) return;
        const next: Record<number, ClassGroupEditorState> = {};
        let reread = false;
        for (const group of groups) {
            const previous = currentStates.current[group.id];
            const baseline = contextOf(group);
            const readback = readbacks.current.get(group.id);
            // A GET started before the PUT may finish after it. Keep the saved
            // snapshot and request one fresh read; no server revision is invented.
            if (previous && readback && differs(baseline, readback.context) && !readback.retryRequested) {
                readback.retryRequested = true;
                next[group.id] = previous;
                reread = true;
                continue;
            }
            if (readback) readbacks.current.delete(group.id);
            // Failed writes remain retryable; newer edits survive rereads and saves.
            next[group.id] = previous && (previous.dirty || previous.busy || previous.failed) ? previous : {
                draft: baseline, baseline, dirty: false, busy: false, saved: previous?.saved ?? false, failed: null,
            };
        }
        for (const [id, request] of pending.current) if (!next[id]) { request.abort(); pending.current.delete(id); }
        publish(next);
        if (reread) reloadRef.current();
    }, [groups, publish]);

    const change = (id: number, fields: Partial<ClassContextDraft>) => {
        const state = currentStates.current[id];
        if (!state || forbidden) return;
        const draft = { ...state.draft, ...fields };
        versions.current[id] = (versions.current[id] ?? 0) + 1;
        patch(id, { draft, dirty: differs(draft, state.baseline), saved: false });
    };
    const discard = (id: number) => {
        const state = currentStates.current[id];
        if (!state || state.busy) return;
        versions.current[id] = (versions.current[id] ?? 0) + 1;
        patch(id, { draft: state.baseline, dirty: false, saved: false, failed: null });
    };
    const write = async (id: number, operation: Write, retrying = false): Promise<boolean> => {
        const state = currentStates.current[id];
        if (!active.current || !state || forbidden || pending.current.has(id)) return false;
        if (account.current !== getViewAsAccount()?.username) { publish({}); setForbidden(true); return false; }
        const controller = new AbortController();
        pending.current.set(id, controller);
        const version = versions.current[id] ?? 0;
        const sent = { description: state.draft.description.trim(), methodologies: state.draft.methodologies.trim(), visible: state.draft.visible };
        const body = operation.kind === 'context' ? { description: sent.description || null, methodologies: sent.methodologies || null, context_visible_to_students: sent.visible }
            : operation.kind === 'level' ? { school_level: operation.value || null }
                : { institution_id: operation.value ? Number(operation.value) : null };
        const current = () => active.current && !controller.signal.aborted && pending.current.get(id) === controller && !!currentStates.current[id];
        patch(id, { busy: true, failed: retrying ? state.failed : null, saved: false });
        try {
            const response = await apiFetch(`/api/admin/groups/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
            if (!current()) return false;
            if (account.current !== getViewAsAccount()?.username || response.status === 401 || response.status === 403) {
                publish({}); setForbidden(true); return false;
            }
            if (!response.ok) throw new Error('class write failed');
            if (operation.kind === 'context') {
                const draft = (versions.current[id] ?? 0) === version ? sent : currentStates.current[id].draft;
                readbacks.current.set(id, { context: sent, retryRequested: false });
                patch(id, { baseline: sent, draft, dirty: differs(draft, sent), saved: !differs(draft, sent), busy: false, failed: null });
            } else patch(id, { busy: false, failed: null });
            reloadRef.current();
            return true;
        } catch {
            if (current()) {
                if (account.current !== getViewAsAccount()?.username) { publish({}); setForbidden(true); }
                else patch(id, { failed: operation });
            }
            return false;
        } finally {
            if (current()) patch(id, { busy: false });
            if (pending.current.get(id) === controller) pending.current.delete(id);
        }
    };
    return {
        states, forbidden, busy: Object.values(states).some(state => state.busy),
        dirty: Object.values(states).some(state => state.dirty), change, discard,
        save: (id: number) => write(id, { kind: 'context' }),
        setLevel: (id: number, value: string) => write(id, { kind: 'level', value }),
        setInstitution: (id: number, value: string) => write(id, { kind: 'institution', value }),
        retry: (id: number) => { const operation = currentStates.current[id]?.failed; return operation ? write(id, operation, true) : Promise.resolve(false); },
    };
}

export type ClassGroupEditors = ReturnType<typeof useClassGroupEditors>;
