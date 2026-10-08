'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { apiFetch, getViewAsAccount } from '@/lib/auth';
import { forumClosedNotice, forumDraftValid, forumLink, forumPostActions, parseForumDetail, parseForumList, parseForumLog, parseForumPost,
    parseForumTopic, type ForumPost, type ForumTopic } from '@/lib/forum';
import { forumText, type forumTexts } from '@/lib/i18n-forum';
import { useI18n } from '@/lib/i18n-context';
import { useDraftGuard } from '@/lib/use-draft-guard';
import { useTeacherResource } from '@/components/teacher/useTeacherResource';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';

type TextKey = keyof typeof forumTexts;

type ForumAction = (path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: object) => Promise<boolean>;

function ForumMarkdown({ body }: { body: string }) {
    return <div className="prose prose-slate max-w-none text-sm">
        <ReactMarkdown skipHtml allowedElements={['p', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote', 'br', 'a', 'code']} unwrapDisallowed
            urlTransform={href => forumLink(href) || ''}
            components={{ a: ({ href, children }) => href ? <a href={href} rel="nofollow noopener noreferrer" target="_blank">{children}</a> : <span>{children}</span> }}>
            {body}
        </ReactMarkdown>
    </div>;
}

function HideForm({ busy, onHide, onCancel }: { busy: boolean; onHide: (reason: string) => void; onCancel: () => void }) {
    const { lang } = useI18n(); const l = (key: TextKey) => forumText(lang, key);
    const [reason, setReason] = useState('');
    return <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); if (reason.trim()) onHide(reason.trim()); }}>
        <label className="block min-w-0 flex-1 text-sm font-semibold text-slate-700">{l('reason')}
            <input value={reason} maxLength={500} disabled={busy} onChange={event => setReason(event.target.value)}
                className="mt-1 block min-h-[44px] w-full rounded-md border border-slate-300 bg-white p-2 font-normal" />
        </label>
        <Button type="submit" variant="danger" disabled={busy || !reason.trim()}>{l('hideConfirm')}</Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>{l('cancel')}</Button>
    </form>;
}

function EditForm({ initial, busy, onSave, onCancel }: { initial: string; busy: boolean; onSave: (body: string) => void; onCancel: () => void }) {
    const { lang } = useI18n(); const l = (key: TextKey) => forumText(lang, key);
    const [body, setBody] = useState(initial);
    useDraftGuard(body !== initial, l('discard'), { blocked: busy });
    return <form className="space-y-2" onSubmit={event => { event.preventDefault(); if (forumDraftValid(body)) onSave(body); }}>
        <label className="block text-sm font-semibold text-slate-700">{l('edit')}
            <textarea value={body} maxLength={4000} disabled={busy} rows={4} onChange={event => setBody(event.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white p-3 text-base font-normal" />
            <span className="font-mono text-xs text-slate-500">{body.length} / 4000</span>
        </label>
        <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !forumDraftValid(body) || body === initial}>{l('save')}</Button>
            <Button type="button" variant="secondary" disabled={busy}
                onClick={() => { if (body === initial || window.confirm(l('discard'))) onCancel(); }}>{l('cancel')}</Button>
        </div>
    </form>;
}

function ForumMessage({ post, moderator = false, active = false, busy = false, onAction }: {
    post: ForumPost; moderator?: boolean; active?: boolean; busy?: boolean; onAction?: ForumAction;
}) {
    const { lang } = useI18n(); const l = (key: TextKey) => forumText(lang, key);
    const [mode, setMode] = useState<'view' | 'edit' | 'hide'>('view');
    const actions = onAction ? forumPostActions(post, { moderator, active }) : { edit: false, delete: false, hide: false, restore: false };
    const run = async (path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: object) => {
        if (onAction && await onAction(path, method, body)) setMode('view');
    };
    return <article className="min-w-0 space-y-2 break-words border-b border-slate-200 py-4 last:border-0">
        <p className="text-sm text-slate-600">{post.author_display_name} · <time dateTime={post.created_at}>{new Date(post.created_at).toLocaleString(lang)}</time>
            {post.edited_at && !post.deleted && <> · <span title={new Date(post.edited_at).toLocaleString(lang)}>{l('edited')}</span></>}</p>
        {post.deleted ? <p className="text-sm text-slate-500">{l('deleted')}</p>
            : mode === 'edit' && post.body !== null ? <EditForm initial={post.body} busy={busy} onCancel={() => setMode('view')}
                onSave={body => void run(`/api/forum/posts/${post.id}`, 'PATCH', { body })} />
            : post.body === null ? <p className="text-sm text-slate-500">{l('hidden')}</p>
            : <ForumMarkdown body={post.body} />}
        {post.hidden && post.hidden_reason !== null && <p className="text-sm font-semibold text-amber-800">
            {l('hiddenWithReason')}: “{post.hidden_reason}”</p>}
        {mode === 'hide' && <HideForm busy={busy} onCancel={() => setMode('view')}
            onHide={reason => void run(`/api/teacher/forum/posts/${post.id}/hide`, 'POST', { reason })} />}
        {mode === 'view' && (actions.edit || actions.delete || actions.hide || actions.restore) && <div className="flex flex-wrap gap-2">
            {actions.edit && <Button size="sm" variant="secondary" disabled={busy} onClick={() => setMode('edit')}>{l('edit')}</Button>}
            {actions.delete && <Button size="sm" variant="secondary" disabled={busy}
                onClick={() => { if (window.confirm(l('deleteConfirm'))) void run(`/api/forum/posts/${post.id}`, 'DELETE'); }}>{l('delete')}</Button>}
            {actions.hide && <Button size="sm" variant="secondary" disabled={busy} onClick={() => setMode('hide')}>{l('hide')}</Button>}
            {actions.restore && <Button size="sm" variant="secondary" disabled={busy}
                onClick={() => void run(`/api/teacher/forum/posts/${post.id}/restore`, 'POST')}>{l('restore')}</Button>}
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

function TopicModeration({ topic, busy, onAction }: { topic: ForumTopic; busy: boolean; onAction: ForumAction }) {
    const { lang } = useI18n(); const l = (key: TextKey) => forumText(lang, key);
    const [hiding, setHiding] = useState(false);
    const base = `/api/teacher/forum/topics/${topic.id}`;
    if (hiding) return <HideForm busy={busy} onCancel={() => setHiding(false)}
        onHide={reason => void onAction(`${base}/hide`, 'POST', { reason }).then(done => { if (done) setHiding(false); })} />;
    return <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void onAction(`${base}/${topic.pinned ? 'unpin' : 'pin'}`, 'POST')}>{l(topic.pinned ? 'unpin' : 'pin')}</Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void onAction(`${base}/${topic.locked ? 'unlock' : 'lock'}`, 'POST')}>{l(topic.locked ? 'unlock' : 'lock')}</Button>
        {topic.hidden ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => void onAction(`${base}/restore`, 'POST')}>{l('restore')}</Button>
            : <Button size="sm" variant="secondary" disabled={busy} onClick={() => setHiding(true)}>{l('hide')}</Button>}
    </div>;
}

function ForumDiscussion({ groupId, groupActive, topicId, onBack, onForbidden, onDraft }: {
    groupId: number; groupActive: boolean; topicId: number; onBack: () => void; onForbidden: () => void; onDraft: (dirty: boolean, busy: boolean) => void;
}) {
    const { lang } = useI18n(); const l = (key: TextKey) => forumText(lang, key);
    const [offset, setOffset] = useState(0);
    const [acting, setActing] = useState(false); const [actionError, setActionError] = useState(false);
    const account = useRef(getViewAsAccount()?.username);
    const resource = useTeacherResource(`/api/forum/topics/${topicId}?offset=${offset}`, parseForumDetail);
    const detail = resource.data;
    const act: ForumAction = async (path, method, body) => {
        if (acting) return false;
        if (account.current !== getViewAsAccount()?.username) { onForbidden(); return false; }
        setActing(true); setActionError(false);
        try {
            const response = await apiFetch(path, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) });
            if (account.current !== getViewAsAccount()?.username || response.status === 401) { onForbidden(); return false; }
            // 403/409 mean someone else changed the state first: reload and say so.
            if (!response.ok) { setActionError(true); return false; }
            return true;
        } catch { setActionError(true); return false; }
        finally { setActing(false); void resource.reload(); }
    };
    if (resource.forbidden || (detail && detail.topic.group_id !== groupId)) return <Callout variant="danger">{l('forbidden')}</Callout>;
    if (!detail) return <Callout variant={resource.failed ? 'danger' : 'info'}>
        <p>{l(resource.failed ? 'loadError' : 'loading')}</p>
        {resource.failed && <Button variant="secondary" onClick={() => void resource.reload()}>{l('retry')}</Button>}
    </Callout>;
    const moderate = detail.can_moderate && groupActive;
    return <Card className="space-y-4">
        <Button variant="secondary" onClick={onBack}>{l('back')}</Button>
        <h3 className="break-words text-lg font-bold text-slate-800">{detail.topic.title || l('hidden')}{detail.topic.pinned && ` · ${l('pinned')}`}</h3>
        {moderate && <TopicModeration topic={detail.topic} busy={acting} onAction={act} />}
        {actionError && <p role="alert" className="text-sm text-red-700">{l('actionError')}</p>}
        <ForumMessage post={detail.topic} />
        {resource.failed && <Callout variant="danger">{l('loadError')} <Button variant="secondary" onClick={() => void resource.reload()}>{l('retry')}</Button></Callout>}
        <div aria-busy={resource.loading}>{detail.posts.map(post => <ForumMessage key={post.id} post={post} moderator={detail.can_moderate}
            active={groupActive} busy={acting} onAction={act} />)}</div>
        <div className="flex gap-2">
            {offset > 0 && <Button variant="secondary" disabled={resource.loading} onClick={() => setOffset(value => Math.max(0, value - 50))}>{l('previous')}</Button>}
            {detail.has_more && <Button variant="secondary" disabled={resource.loading} onClick={() => setOffset(value => value + 50)}>{l('more')}</Button>}
        </div>
        {detail.can_reply ? <ForumComposer path={`/api/forum/topics/${topicId}/posts`} topic={false} onForbidden={onForbidden} onDraft={onDraft}
            onPublished={() => { setOffset(Math.floor(detail.topic.replies_count / 50) * 50); void resource.reload(); }} /> :
            <Callout variant="warning">{l(forumClosedNotice(groupActive, detail.topic))}</Callout>}
    </Card>;
}

const LOG_ACTIONS: Record<string, TextKey> = { hide: 'logHide', restore: 'logRestore', lock: 'logLock', unlock: 'logUnlock', pin: 'logPin', unpin: 'logUnpin' };

function ForumLogView({ groupId, onBack }: { groupId: number; onBack: () => void }) {
    const { lang } = useI18n(); const l = (key: TextKey) => forumText(lang, key);
    const [offset, setOffset] = useState(0);
    const resource = useTeacherResource(`/api/teacher/groups/${groupId}/forum/log?offset=${offset}`, parseForumLog);
    const log = resource.data;
    return <Card className="space-y-4">
        <Button variant="secondary" onClick={onBack}>{l('back')}</Button>
        <h3 className="text-lg font-bold text-slate-800">{l('log')}</h3>
        <p className="text-xs text-slate-500">{l('logPrivacy')}</p>
        {resource.forbidden ? <Callout variant="danger">{l('forbidden')}</Callout> : !log ? <Callout variant={resource.failed ? 'danger' : 'info'}>
            <p>{l(resource.failed ? 'loadError' : 'loading')}</p>
            {resource.failed && <Button variant="secondary" onClick={() => void resource.reload()}>{l('retry')}</Button>}
        </Callout> : <>
            {!log.entries.length && <p className="text-sm text-slate-600">{l('logEmpty')}</p>}
            <ul className="divide-y divide-slate-200">{log.entries.map(entry => <li key={entry.id} className="min-w-0 break-words py-3 text-sm text-slate-700">
                <time className="font-mono text-xs text-slate-500" dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString(lang)}</time>
                <span className="block">{entry.actor_username} {LOG_ACTIONS[entry.action] ? l(LOG_ACTIONS[entry.action]) : entry.action}{' '}
                    {l(entry.target_kind === 'topic' ? 'logTopic' : 'logPost')} #{entry.target_id}</span>
                {entry.reason && <span className="block text-slate-600">“{entry.reason}”</span>}
            </li>)}</ul>
            <div className="flex gap-2">
                {offset > 0 && <Button variant="secondary" disabled={resource.loading} onClick={() => setOffset(value => Math.max(0, value - 50))}>{l('previous')}</Button>}
                {log.has_more && <Button variant="secondary" disabled={resource.loading} onClick={() => setOffset(value => value + 50)}>{l('more')}</Button>}
            </div>
        </>}
    </Card>;
}

export function ForumView({ groupId, student = false }: { groupId: number; student?: boolean }) {
    const { lang } = useI18n(); const l = (key: TextKey) => forumText(lang, key);
    const [view, setView] = useState<number | 'list' | 'new' | 'log'>('list');
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
            <div className="flex flex-wrap gap-2">
                {view === 'list' && listing.can_moderate && <Button variant="secondary" onClick={() => navigate('log')}>{l('log')}</Button>}
                {view === 'list' && listing.can_open_topic && <Button onClick={() => navigate('new')}>{l('newTopic')}</Button>}
            </div>
        </div>
        {!listing.group.is_active && <Callout variant="warning">{l('archive')}</Callout>}
        {resource.failed && <Callout variant="danger">{l('loadError')} <Button variant="secondary" onClick={() => void resource.reload()}>{l('retry')}</Button></Callout>}
        {view === 'new' && listing.can_open_topic && <Card><ForumComposer path={`/api/groups/${groupId}/forum/topics`} topic onDraft={onDraft}
            onForbidden={() => setForbidden(true)} onCancel={() => navigate('list')} onPublished={id => { setView(id); void resource.reload(); }} /></Card>}
        {view === 'log' && listing.can_moderate && <ForumLogView groupId={groupId} onBack={() => navigate('list')} />}
        {typeof view === 'number' && <ForumDiscussion key={view} groupId={groupId} groupActive={listing.group.is_active} topicId={view} onBack={() => navigate('list')} onDraft={onDraft} onForbidden={() => setForbidden(true)} />}
        {view === 'list' && <Card>
            {!listing.topics.length && <p className="text-sm text-slate-600">{l('empty')}</p>}
            <ul className="divide-y divide-slate-200">{listing.topics.map(topic => <li key={topic.id}>
                <button type="button" className="block min-h-[44px] w-full space-y-1 py-3 text-left" onClick={() => navigate(topic.id)}>
                    <span className="block break-words font-semibold text-indigo-700">{topic.pinned && `📌 ${l('pinned')} · `}{topic.locked && '🔒 '}{topic.title || l('hidden')}</span>
                    {topic.hidden && topic.hidden_reason !== null && <span className="block text-sm font-semibold text-amber-800">{l('hiddenWithReason')}: “{topic.hidden_reason}”</span>}
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
