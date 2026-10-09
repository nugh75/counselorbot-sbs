import type { AssignmentStepSummary, ClassPathStep } from './class-paths';

// TF6: whole-class goal assignments a path step can reference. The server
// re-validates class, recipients, goal source and revocation on every save.
export function parsePathAssignments(input: unknown): AssignmentStepSummary[] {
    if (!Array.isArray(input)) return [];
    return input.flatMap(item => {
        if (!item || typeof item !== 'object') return [];
        const row = item as Record<string, unknown>;
        if (row.recipient_username != null || row.revoked_at != null) return [];
        const snapshot = (row.snapshot && typeof row.snapshot === 'object' ? row.snapshot : {}) as Record<string, unknown>;
        const attachments = Array.isArray(row.attachments) ? row.attachments : [];
        return [{
            id: Number(row.id),
            title: String(snapshot.title || ''),
            attachments: attachments.filter(value => value && typeof value === 'object').map(value => {
                const attachment = value as Record<string, unknown>;
                return {kind: String(attachment.kind || ''), title: String(attachment.title || '')};
            }),
            intent: row.intent ? String(row.intent) : undefined,
            due_date: row.due_date ? String(row.due_date) : null,
        }];
    });
}

// An assignment is the target of at most one step of a path.
export function selectablePathAssignments(rows: AssignmentStepSummary[], steps: ClassPathStep[]): AssignmentStepSummary[] {
    const used = new Set(steps.filter(step => step.step_type === 'assignment').map(step => step.assignment_id));
    return rows.filter(row => !used.has(row.id));
}

export function assignmentStepInput(row: AssignmentStepSummary, position: number): ClassPathStep {
    return {position, step_type: 'assignment', assignment_id: row.id, assignment_summary: row, tool_key: '',
        auto_detect: true, can_self_mark: false};
}

const ASSIGNMENT_ERRORS = new Set(['assignment_class_mismatch', 'assignment_targeted', 'assignment_revoked',
    'assignment_not_goal', 'assignment_class_inactive', 'duplicate_assignment_step']);

export function assignmentSaveError(detail: unknown): boolean {
    return typeof detail === 'string' && ASSIGNMENT_ERRORS.has(detail);
}
