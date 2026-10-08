export interface ForumPost {
    id: number;
    author_display_name: string;
    body: string | null;
    hidden: boolean;
    deleted: boolean;
    /** Moderators only; null for everyone else. */
    hidden_reason: string | null;
    /** The viewer wrote this message. */
    own: boolean;
    created_at: string;
    edited_at: string | null;
}

export interface ForumTopic extends ForumPost {
    group_id: number;
    title: string | null;
    pinned: boolean;
    locked: boolean;
    last_post_at: string;
    replies_count: number;
}

export interface ForumList {
    group: { id: number; name: string; is_active: boolean };
    can_open_topic: boolean;
    can_moderate: boolean;
    topics: ForumTopic[];
    has_more: boolean;
}

export interface ForumDetail {
    topic: ForumTopic;
    posts: ForumPost[];
    can_reply: boolean;
    can_moderate: boolean;
    has_more: boolean;
}

export interface ForumLogEntry {
    id: number;
    actor_username: string;
    action: string;
    target_kind: string;
    target_id: number | null;
    reason: string | null;
    created_at: string;
}

export interface ForumLog {
    entries: ForumLogEntry[];
    has_more: boolean;
}

function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid forum response');
    return value as Record<string, unknown>;
}

export function parseForumPost(value: unknown): ForumPost {
    const row = record(value);
    if (!Number.isInteger(row.id) || typeof row.author_display_name !== 'string' || typeof row.created_at !== 'string'
        || (row.body !== null && typeof row.body !== 'string') || typeof row.hidden !== 'boolean' || typeof row.deleted !== 'boolean'
        || (row.hidden_reason !== null && typeof row.hidden_reason !== 'string') || typeof row.own !== 'boolean'
        || (row.edited_at !== null && typeof row.edited_at !== 'string')) {
        throw new Error('Invalid forum post');
    }
    return row as unknown as ForumPost;
}

export function parseForumTopic(value: unknown): ForumTopic {
    const row = record(value);
    parseForumPost(row);
    if (!Number.isInteger(row.group_id) || (row.title !== null && typeof row.title !== 'string')
        || typeof row.pinned !== 'boolean' || typeof row.locked !== 'boolean' || !Number.isInteger(row.replies_count)) {
        throw new Error('Invalid forum topic');
    }
    return row as unknown as ForumTopic;
}

export function parseForumList(value: unknown): ForumList {
    const row = record(value); const group = record(row.group);
    if (!Number.isInteger(group.id) || typeof group.name !== 'string' || typeof group.is_active !== 'boolean'
        || typeof row.can_open_topic !== 'boolean' || typeof row.can_moderate !== 'boolean'
        || typeof row.has_more !== 'boolean' || !Array.isArray(row.topics)) {
        throw new Error('Invalid forum list');
    }
    return { group: group as unknown as ForumList['group'], can_open_topic: row.can_open_topic, can_moderate: row.can_moderate,
        has_more: row.has_more, topics: row.topics.map(parseForumTopic) };
}

export function parseForumDetail(value: unknown): ForumDetail {
    const row = record(value);
    if (!Array.isArray(row.posts) || typeof row.can_reply !== 'boolean' || typeof row.can_moderate !== 'boolean'
        || typeof row.has_more !== 'boolean') throw new Error('Invalid discussion');
    return { topic: parseForumTopic(row.topic), posts: row.posts.map(parseForumPost), can_reply: row.can_reply,
        can_moderate: row.can_moderate, has_more: row.has_more };
}

export function parseForumLog(value: unknown): ForumLog {
    const row = record(value);
    if (!Array.isArray(row.entries) || typeof row.has_more !== 'boolean') throw new Error('Invalid moderation log');
    const entries = row.entries.map(item => {
        const entry = record(item);
        if (!Number.isInteger(entry.id) || typeof entry.actor_username !== 'string' || typeof entry.action !== 'string'
            || typeof entry.target_kind !== 'string' || typeof entry.created_at !== 'string'
            || (entry.target_id !== null && !Number.isInteger(entry.target_id))
            || (entry.reason !== null && typeof entry.reason !== 'string')) throw new Error('Invalid moderation log entry');
        return entry as unknown as ForumLogEntry;
    });
    return { entries, has_more: row.has_more };
}

/** Why the composer is missing: archive wins, then a hidden topic, then a lock. */
export function forumClosedNotice(groupActive: boolean, topic: Pick<ForumTopic, 'hidden' | 'locked'>): 'archive' | 'hiddenTopic' | 'closed' {
    if (!groupActive) return 'archive';
    return topic.hidden ? 'hiddenTopic' : 'closed';
}

/** Controls a reply offers to the viewer; the server enforces the same rules. */
export function forumPostActions(post: ForumPost, { moderator, active }: { moderator: boolean; active: boolean }) {
    const open = active && !post.deleted;
    return {
        edit: open && post.own && !post.hidden,
        delete: open && post.own,
        hide: open && moderator && !post.hidden,
        restore: open && moderator && post.hidden,
    };
}

export function forumDraftValid(body: string, title?: string): boolean {
    return body.trim().length > 0 && body.trim().length <= 4000
        && (title === undefined || (title.trim().length > 0 && title.trim().length <= 160));
}

export function forumLink(href: string): string | undefined {
    return /^https?:\/\//i.test(href) ? href : undefined;
}
