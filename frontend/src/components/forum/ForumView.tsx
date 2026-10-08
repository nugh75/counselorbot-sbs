'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { apiFetch, getViewAsAccount } from '@/lib/auth';
import { forumDraftValid, forumLink, parseForumDetail, parseForumList, parseForumPost, parseForumTopic, type ForumPost } from '@/lib/forum';
import { forumText, type forumTexts } from '@/lib/i18n-forum';
import { useI18n } from '@/lib/i18n-context';
import { useDraftGuard } from '@/lib/use-draft-guard';
import { useTeacherResource } from '@/components/teacher/useTeacherResource';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';

type TextKey = keyof typeof forumTexts;

function ForumMessage({ post }: { post: ForumPost }) {
    const { lang } = useI18n();
    return <article className="min-w-0 space-y-2 break-words border-b border-slate-200 py-4 last:border-0">
        <p className="text-sm text-slate-600">{post.author_display_name} · <time dateTime={post.created_at}>{new Date(post.created_at).toLocaleString(lang)}</time></p>
        {post.hidden || post.deleted ? <p className="text-sm text-slate-500">{forumText(lang, post.deleted ? 'deleted' : 'hidden')}</p> :
            <div className="prose prose-slate max-w-none text-sm">
                <ReactMarkdown skipHtml allowedElements={['p', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote', 'br', 'a', 'code']} unwrapDisallowed
                    urlTransform={href => forumLink(href) || ''}
                    components={{ a: ({ href, children }) => href ? <a href={href} rel="nofollow noopener noreferrer" target="_blank">{children}</a> : <span>{children}</span> }}>
                    {post.body || ''}
                </ReactMarkdown>
            </div>}
    </article>;
}

function ForumComposer({ path, topic, onPublished, onForbidden, onDraft, onCancel }: {
    path: string; topic: boolean; onPublished: (id: number) => void; onForbidden: () => void;
    onDraft: (dirty: boolean, busy: boolean) => void; onCancel?: () => void;
}) {
    const { lang } = useI18n(); const l = (key: TextKey) => forumText(lang, key);
    const [body, setBody] = useState(''); const [title, setTitle] = useState('');
    const [busy, setBusy] = useState(false); const [error, setNotice] = useState<TextKey | null>(null);
    const pending = useRef<AbortController | null>(null); const active = useRef(false);
    const account = useRef(getViewAsAccount()?.username);
    const dirty = body.length > 0 || title.length > 0;
    useDraftGuard(dirty || busy, l('discard'), { blocked: busy });
    useEffect(() => { onDraft(dirty, busy); }, [dirty, busy, onDraft]);
    useEffect(() => {
        active.current = true;
        return () => { active.current = false; pending.current?.abort(); onDraft(false, false); };
    }, [onDraft]);
    const send = async () => {
        if (pending.current || !forumDraftValid(body, topic ? title : undefined)) return;
        if (account.current !== getViewAsAccount()?.username) { onForbidden(); return; }
        const controller = new AbortController(); pending.current = controller;
        setBusy(true); setNotice(null);
        const current = () => active.current && !controller.signal.aborted;
        try {
            const response = await apiFetch(path, { method: 'POST', signal: controller.signal,
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(topic ? { title, body } : { body }) });
            if (!current()) return;
            if (account.current !== getViewAsAccount()?.username || response.status === 401) { onForbidden(); return; }
            if (response.status === 429) { setNotice('rateLimit'); return; }
            // A membership/role change or archive transition leaves the unsent
            // draft visible without assuming that the operation succeeded.
            if (!response.ok) throw new Error('Forum send failed');
            const payload: unknown = await response.json();
            const saved = topic ? parseForumTopic(payload) : parseForumPost(payload);
            if (!current()) return;
            if (account.current !== getViewAsAccount()?.username) { onForbidden(); return; }
            setBody(''); setTitle(''); onDraft(false, false); onPublished(saved.id);
        } catch { if (current()) setNotice('sendError'); }
        finally { if (current()) { pending.current = null; setBusy(false); } }
    };
    return <form className="space-y-3" onSubmit={event => { event.preventDefault(); void send(); }}>
        {topic && <label className="block text-sm font-semibold text-slate-700">{l('title')}
            <input value={title} maxLength={160} disabled={busy} onChange={event => setTitle(event.target.value)}
                className="mt-1 block min-h-[44px] w-full rounded-md border border-slate-300 bg-white p-2" />
            <span className="font-mono text-xs text-slate-500">{title.length} / 160</span>
        </label>}
        <label className="block text-sm font-semibold text-slate-700">{l(topic ? 'body' : 'reply')}
            <textarea value={body} maxLength={4000} disabled={busy} rows={5} onChange={event => setBody(event.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-3 text-base font-normal" />
            <span className="font-mono text-xs text-slate-500">{body.length} / 4000</span>
        </label>
        <p className="text-xs text-slate-500">{l('safeText')}</p>
        {error && <p role="alert" className="text-sm text-red-700">{l(error)}</p>}
        <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !forumDraftValid(body, topic ? title : undefined)}>{l(busy ? 'sending' : 'send')}</Button>
            {onCancel && <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>{l('cancel')}</Button>}
        </div>
    </form>;
}

function ForumDiscussion({ groupId, topicId, onBack, onForbidden, onDraft }: {
    groupId: number; topicId: number; onBack: () => void; onForbidden: () => void; onDraft: (dirty: boolean, busy: boolean) => void;
}) {
    const { lang } = useI18n(); const l = (key: TextKey) => forumText(lang, key);
    const [offset, setOffset] = useState(0);
    const resource = useTeacherResource(`/api/forum/topics/${topicId}?offset=${offset}`, parseForumDetail);
    const detail = resource.data;
    if (resource.forbidden || (detail && detail.topic.group_id !== groupId)) return <Callout variant="danger">{l('forbidden')}</Callout>;
    if (!detail) return <Callout variant={resource.failed ? 'danger' : 'info'}>
        <p>{l(resource.failed ? 'loadError' : 'loading')}</p>
        {resource.failed && <Button variant="secondary" onClick={() => void resource.reload()}>{l('retry')}</Button>}
    </Callout>;
    return <Card className="space-y-4">
        <Button variant="secondary" onClick={onBack}>{l('back')}</Button>
        <h3 className="break-words text-lg font-bold text-slate-800">{detail.topic.title || l('hidden')}{detail.topic.pinned && ` · ${l('pinned')}`}</h3>
        <ForumMessage post={detail.topic} />
        {resource.failed && <Callout variant="danger">{l('loadError')} <Button variant="secondary" onClick={() => void resource.reload()}>{l('retry')}</Button></Callout>}
        <div aria-busy={resource.loading}>{detail.posts.map(post => <ForumMessage key={post.id} post={post} />)}</div>
        <div className="flex gap-2">
            {offset > 0 && <Button variant="secondary" disabled={resource.loading} onClick={() => setOffset(value => Math.max(0, value - 50))}>{l('previous')}</Button>}
            {detail.has_more && <Button variant="secondary" disabled={resource.loading} onClick={() => setOffset(value => value + 50)}>{l('more')}</Button>}
        </div>
        {detail.can_reply ? <ForumComposer path={`/api/forum/topics/${topicId}/posts`} topic={false} onForbidden={onForbidden} onDraft={onDraft}
            onPublished={() => { setOffset(Math.floor(detail.topic.replies_count / 50) * 50); void resource.reload(); }} /> :
            <Callout variant="warning">{l(detail.topic.locked ? 'closed' : 'archive')}</Callout>}
    </Card>;
}

export function ForumView({ groupId, student = false }: { groupId: number; student?: boolean }) {
    const { lang } = useI18n(); const l = (key: TextKey) => forumText(lang, key);
    const [view, setView] = useState<number | 'list' | 'new'>('list');
    const [offset, setOffset] = useState(0); const [forbidden, setForbidden] = useState(false);
    const draft = useRef({ dirty: false, busy: false });
    const onDraft = useCallback((dirty: boolean, busy: boolean) => { draft.current = { dirty, busy }; }, []);
    const resource = useTeacherResource(`/api/groups/${groupId}/forum/topics?offset=${offset}`, parseForumList);
    const listing = resource.data;
    const Heading = student ? 'h1' : 'h2';
    const navigate = (next: typeof view) => {
        if (draft.current.busy || (draft.current.dirty && !window.confirm(l('discard')))) return;
        setView(next);
        if (next === 'list') void resource.reload();
    };
    if (forbidden || resource.forbidden || (listing && listing.group.id !== groupId)) return <Callout variant="danger">{l('forbidden')}</Callout>;
    if (!listing) return <Callout variant={resource.failed ? 'danger' : 'info'}>
        <p>{l(resource.failed ? 'loadError' : 'loading')}</p>
        {resource.failed && <Button variant="secondary" onClick={() => void resource.reload()}>{l('retry')}</Button>}
    </Callout>;
    return <div className="space-y-4">
        {student && <Link className="inline-flex min-h-[44px] items-center text-sm text-indigo-700" href="/profilo/classi">{l('classes')}</Link>}
        <div className="flex flex-wrap items-center justify-between gap-3">
            <Heading className="break-words text-lg font-bold text-slate-800">{l('forum')} · {listing.group.name}</Heading>
            {view === 'list' && listing.can_open_topic && <Button onClick={() => navigate('new')}>{l('newTopic')}</Button>}
        </div>
        {!listing.group.is_active && <Callout variant="warning">{l('archive')}</Callout>}
        {resource.failed && <Callout variant="danger">{l('loadError')} <Button variant="secondary" onClick={() => void resource.reload()}>{l('retry')}</Button></Callout>}
        {view === 'new' && listing.can_open_topic && <Card><ForumComposer path={`/api/groups/${groupId}/forum/topics`} topic onDraft={onDraft}
            onForbidden={() => setForbidden(true)} onCancel={() => navigate('list')} onPublished={id => { setView(id); void resource.reload(); }} /></Card>}
        {typeof view === 'number' && <ForumDiscussion key={view} groupId={groupId} topicId={view} onBack={() => navigate('list')} onDraft={onDraft} onForbidden={() => setForbidden(true)} />}
        {view === 'list' && <Card>
            {!listing.topics.length && <p className="text-sm text-slate-600">{l('empty')}</p>}
            <ul className="divide-y divide-slate-200">{listing.topics.map(topic => <li key={topic.id}>
                <button type="button" className="block min-h-[44px] w-full space-y-1 py-3 text-left" onClick={() => navigate(topic.id)}>
                    <span className="block break-words font-semibold text-indigo-700">{topic.pinned && `📌 ${l('pinned')} · `}{topic.locked && '🔒 '}{topic.title || l('hidden')}</span>
                    <span className="block text-sm text-slate-600">{topic.author_display_name} · {topic.replies_count} {l('replies')}{topic.locked && ` · ${l('closed')}`}</span>
                </button>
            </li>)}</ul>
            <div className="flex gap-2">
                {offset > 0 && <Button variant="secondary" disabled={resource.loading} onClick={() => setOffset(value => Math.max(0, value - 50))}>{l('previous')}</Button>}
                {listing.has_more && <Button variant="secondary" disabled={resource.loading} onClick={() => setOffset(value => value + 50)}>{l('more')}</Button>}
            </div>
        </Card>}
    </div>;
}
