export interface ForumPost {
    id: number;
    author_display_name: string;
    body: string | null;
    hidden: boolean;
    deleted: boolean;
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
    topics: ForumTopic[];
    has_more: boolean;
}

export interface ForumDetail {
    topic: ForumTopic;
    posts: ForumPost[];
    can_reply: boolean;
    has_more: boolean;
}

function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid forum response');
    return value as Record<string, unknown>;
}

export function parseForumPost(value: unknown): ForumPost {
    const row = record(value);
    if (!Number.isInteger(row.id) || typeof row.author_display_name !== 'string' || typeof row.created_at !== 'string'
        || (row.body !== null && typeof row.body !== 'string') || typeof row.hidden !== 'boolean' || typeof row.deleted !== 'boolean') {
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
        || typeof row.can_open_topic !== 'boolean' || typeof row.has_more !== 'boolean' || !Array.isArray(row.topics)) {
        throw new Error('Invalid forum list');
    }
    return { group: group as unknown as ForumList['group'], can_open_topic: row.can_open_topic,
        has_more: row.has_more, topics: row.topics.map(parseForumTopic) };
}

export function parseForumDetail(value: unknown): ForumDetail {
    const row = record(value);
    if (!Array.isArray(row.posts) || typeof row.can_reply !== 'boolean' || typeof row.has_more !== 'boolean') throw new Error('Invalid discussion');
    return { topic: parseForumTopic(row.topic), posts: row.posts.map(parseForumPost), can_reply: row.can_reply, has_more: row.has_more };
}

export function forumDraftValid(body: string, title?: string): boolean {
    return body.trim().length > 0 && body.trim().length <= 4000
        && (title === undefined || (title.trim().length > 0 && title.trim().length <= 160));
}

export function forumLink(href: string): string | undefined {
    return /^https?:\/\//i.test(href) ? href : undefined;
}
