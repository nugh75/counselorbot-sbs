'use client';

import { useEffect, useRef, useState } from 'react';
import { ForumComposer, TopicForm } from '@/components/forum/ForumView';
import { apiFetch, getViewAsAccount } from '@/lib/auth';
import { forumTopicEditable, parseForumDetail } from '@/lib/forum';
import { forumText } from '@/lib/i18n-forum';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { useTeacherResource } from './useTeacherResource';
import type { ResourceDraft } from './PathResourceDialog';

interface Props {
    groupId: number; topicId: number | null; onSaved: (topicId: number) => void;
    onDraft: ResourceDraft; onCancel: () => void;
}

export function PathDiscussionEditor(props: Props) {
    const { lang } = useI18n();
    const [forbidden, setForbidden] = useState(false);
    if (props.topicId !== null) return <EditDiscussion {...props} topicId={props.topicId} />;
    return <div className="space-y-3">
        {forbidden && <Callout variant="danger">{forumText(lang, 'forbidden')}</Callout>}
        <ForumComposer path={`/api/groups/${props.groupId}/forum/topics`} topic guard={false}
            onDraft={props.onDraft} onCancel={props.onCancel} onPublished={props.onSaved}
            onForbidden={() => setForbidden(true)} />
    </div>;
}

function EditDiscussion({ groupId, topicId, onSaved, onDraft, onCancel }: Props & {topicId: number}) {
    const { lang } = useI18n();
    const resource = useTeacherResource(`/api/forum/topics/${topicId}`, parseForumDetail);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const pending = useRef<AbortController | null>(null);
    const account = useRef(getViewAsAccount()?.username);
    useEffect(() => () => { pending.current?.abort(); }, []);
    const detail = resource.data;
    const save = async (changes: {title?: string; body?: string}) => {
        if (pending.current) return;
        if (account.current !== getViewAsAccount()?.username) { setFailed(true); return; }
        const controller = new AbortController();
        pending.current = controller;
        setBusy(true); setFailed(false);
        try {
            const response = await apiFetch(`/api/forum/topics/${topicId}`, {method: 'PATCH', signal: controller.signal,
                headers: {'Content-Type': 'application/json'}, body: JSON.stringify(changes)});
            if (controller.signal.aborted) return;
            if (!response.ok || account.current !== getViewAsAccount()?.username) throw new Error('discussion edit');
            onSaved(topicId);
        } catch { if (!controller.signal.aborted) setFailed(true); }
        finally { if (!controller.signal.aborted) { pending.current = null; setBusy(false); } }
    };
    if (resource.forbidden || (detail && (detail.topic.group_id !== groupId || detail.forum_enabled === false
        || detail.mute || !forumTopicEditable(detail.topic, {moderator: detail.can_moderate, active: true})))) {
        return <Callout variant="danger">{forumText(lang, 'forbidden')}</Callout>;
    }
    if (!detail) return <Callout variant={resource.failed ? 'danger' : 'info'}>
        {forumText(lang, resource.failed ? 'loadError' : 'loading')}
        {resource.failed && <Button variant="secondary" onClick={() => void resource.reload()}>{forumText(lang, 'retry')}</Button>}
    </Callout>;
    if (detail.topic.title === null || detail.topic.body === null) return <Callout variant="danger">{forumText(lang, 'forbidden')}</Callout>;
    return <div className="space-y-3">
        {failed && <Callout variant="danger">{forumText(lang, 'sendError')}</Callout>}
        <TopicForm initial={{title: detail.topic.title, body: detail.topic.body}} busy={busy} guard={false}
            onDraft={onDraft} onSave={changes => void save(changes)} onCancel={onCancel} />
    </div>;
}
