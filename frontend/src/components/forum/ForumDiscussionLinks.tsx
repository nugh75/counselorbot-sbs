'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n-context';
import { forumText } from '@/lib/i18n-forum';
import { type ForumDiscussionLink, type ForumTarget } from '@/lib/forum';

/** Links come from the forum access boundary, never from an AI context. */
export function ForumDiscussionLinks({ links, kind, targetId }: {
    links: ForumDiscussionLink[]; kind: ForumTarget['kind']; targetId: number;
}) {
    const { lang } = useI18n();
    return <div className="flex flex-wrap gap-x-4">{links.filter(link => link.kind === kind && link.id === targetId).map(link =>
        <Link key={link.topic_id} href={`/profilo/classi/${link.group_id}/forum?topic=${link.topic_id}`}
            className="inline-flex min-h-[44px] items-center text-sm font-semibold text-indigo-700 underline">
            {forumText(lang, 'discuss')}
        </Link>)}</div>;
}
