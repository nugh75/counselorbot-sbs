import type { ClassPathStep, ForumStepState } from './class-paths';
import type { ForumTopic } from './forum';

// TF7: published, visible discussions of this class a forum step can reference.
// The builder reads them from the forum API; the server re-validates class,
// publication, visibility and the class forum setting on every save.
export interface PathForumTopic {
    id: number;
    title: string;
    locked: boolean;
}

export function pathForumTopics(topics: ForumTopic[]): PathForumTopic[] {
    return topics
        .filter(topic => topic.status === 'published' && !topic.hidden && !topic.deleted && topic.title)
        .map(topic => ({id: topic.id, title: String(topic.title), locked: topic.locked}));
}

// A discussion is the target of at most one step of a path.
export function selectablePathForumTopics(rows: PathForumTopic[], steps: ClassPathStep[]): PathForumTopic[] {
    const used = new Set(steps.filter(step => step.step_type === 'forum').map(step => step.topic_id));
    return rows.filter(row => !used.has(row.id));
}

export function forumStepInput(row: PathForumTopic, groupId: number, position: number): ClassPathStep {
    return {position, step_type: 'forum', topic_id: row.id, forum_summary: {id: row.id, group_id: groupId, locked: row.locked},
        tool_key: '', auto_detect: true, can_self_mark: false};
}

const FORUM_ERRORS = new Set(['forum_topic_class_mismatch', 'forum_topic_unavailable', 'forum_class_inactive',
    'forum_disabled_for_class', 'duplicate_forum_step']);

export function forumSaveError(detail: unknown): boolean {
    return typeof detail === 'string' && FORUM_ERRORS.has(detail);
}

export type ForumStepNotice = 'pending' | 'locked' | 'muted' | 'hidden';

// The one thing that explains the student's next move on an open forum step.
export function forumStepNotice(state: ForumStepState | null | undefined, done: boolean): ForumStepNotice | null {
    if (!state || done) return null;
    if (state.pending) return 'pending';
    if (state.locked) return 'locked';
    if (state.muted) return 'muted';
    if (state.hidden) return 'hidden';
    return null;
}
