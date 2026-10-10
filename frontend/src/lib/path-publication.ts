// TF8: why a path step cannot go live, as the server reports it on publish,
// restore and in every step it serializes. Reason codes are grouped into the
// action that fixes them; unknown codes fall back to a generic explanation.

export type UnavailableAction =
    | 'platform_tool'
    | 'class_tool'
    | 'institute'
    | 'administration'
    | 'results_step'
    | 'assignment'
    | 'forum'
    | 'class_inactive'
    | 'other';

const ACTIONS: Record<string, UnavailableAction> = {
    tool_unavailable: 'platform_tool',
    tool_disabled_for_class: 'class_tool',
    forum_disabled_for_class: 'class_tool',
    administration_institution_mismatch: 'institute',
    institution_inactive: 'institute',
    institution_credentials_missing: 'institute',
    administration_not_institution_backed: 'institute',
    administration_needs_reconciliation: 'administration',
    administration_delivery_unavailable: 'administration',
    administration_locale_unavailable: 'administration',
    administration_class_mismatch: 'administration',
    administration_inactive: 'administration',
    results_step_unavailable: 'results_step',
    assignment_class_mismatch: 'assignment',
    assignment_targeted: 'assignment',
    assignment_not_goal: 'assignment',
    assignment_revoked: 'assignment',
    forum_topic_class_mismatch: 'forum',
    forum_topic_unavailable: 'forum',
    assignment_class_inactive: 'class_inactive',
    forum_class_inactive: 'class_inactive',
};

export function unavailableAction(reason: string | null | undefined): UnavailableAction | null {
    if (!reason) return null;
    return ACTIONS[reason] ?? 'other';
}

export interface PublicationProblem {
    step_id: number | null;
    position: number;
    step_type: string;
    reason: string;
}

/** The blocked-publication report, or null when the error is something else. */
export function parsePublicationProblems(detail: unknown): PublicationProblem[] | null {
    if (!detail || typeof detail !== 'object') return null;
    const raw = detail as Record<string, unknown>;
    if (raw.code !== 'path_publication_blocked' || !Array.isArray(raw.problems)) return null;
    return raw.problems
        .filter(row => row && typeof row === 'object')
        .map(row => {
            const item = row as Record<string, unknown>;
            return {
                step_id: item.step_id != null ? Number(item.step_id) : null,
                position: Number(item.position || 0),
                step_type: String(item.step_type || 'tool'),
                reason: String(item.reason || ''),
            };
        })
        .sort((a, b) => a.position - b.position);
}

/** Publish, archive and restore send the revision the teacher saw. */
export function lifecycleRequest(revision: number): RequestInit {
    return {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({revision})};
}
