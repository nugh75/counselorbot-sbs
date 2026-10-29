import type { StudentClassPath } from './class-paths';
import type { FrozenSessionSummary } from './frozen-session';

/** A plan draft can resume before it has a chat snapshot; completed attempts cannot. */
export function mergePlanResumes(frozen: FrozenSessionSummary[], paths: StudentClassPath[] | null) {
    const completed = new Set<string>();
    const planSessions = new Set<string>();
    for (const row of frozen) if (row.path_id) planSessions.add(row.session_id);
    const available = new Set(paths?.map(path => path.id));
    const planRows: FrozenSessionSummary[] = [];
    for (const path of paths || []) for (const step of path.steps) {
        for (const attempt of step.activity?.attempts || []) {
            planSessions.add(attempt.session_id);
            if (attempt.state === 'completed') completed.add(attempt.session_id);
        }
        const current = step.activity?.current;
        if (current?.state === 'in_progress' && current.resumable && step.activity?.instrument_code) {
            planRows.push({session_id: current.session_id, path_id: path.id, path_step_id: step.id,
                questionnaire_type: step.activity.instrument_code, current_phase: '',
                label: `${path.title} · ${step.title || step.activity.instrument_code}`, updated_at: current.started_at});
        }
    }
    const seen = new Set<string>();
    const rows = [...frozen, ...planRows].filter(row => {
        if (completed.has(row.session_id) || seen.has(row.session_id)) return false;
        if (paths !== null && row.path_id && !available.has(row.path_id)) return false;
        seen.add(row.session_id);
        return true;
    });
    return {rows, completed, planSessions};
}
