'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { visualLabel } from '@/lib/i18n-visual-tools';
import { Button } from '@/components/ui/Button';

type Link = { session_id: string | null; event_id: string; title: string; timeline_title: string };
export function PortfolioTimelineLinks({ itemId, description, locale }: { itemId: number; description?: string | null; locale: string }) {
    const [data, setData] = useState<{ links: Link[]; snapshot: boolean } | null>(null);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const l = (key: string) => visualLabel(locale, key);
    useEffect(() => {
        const controller = new AbortController();
        void apiFetch(`/api/user/portfolio/${itemId}/timeline-links`, { signal: controller.signal }).then(async response => {
            if (!response.ok) throw new Error();
            setData(await response.json()); setFailed(false);
        }).catch(() => { if (!controller.signal.aborted) setFailed(true); });
        return () => controller.abort();
    }, [itemId, attempt]);
    return <>
        {failed && <Button type="button" variant="ghost" onClick={() => setAttempt(n => n + 1)}>{l('retry')} · {l('timeline')}</Button>}
        {data?.snapshot && description && <details><summary className="min-h-[44px] cursor-pointer py-3 text-sm text-indigo-700">{l('viewSnapshot')}</summary><p className="whitespace-pre-wrap break-words text-sm text-slate-700">{description}</p></details>}
        {data?.links?.map(link => <a key={`${link.session_id}:${link.event_id}`} className="block min-h-[44px] py-3 text-sm text-indigo-700 underline" href={`/profilo/timeline?event=${encodeURIComponent(link.event_id)}`}>{l('backTimeline')}: {link.title} · {link.timeline_title}</a>)}
    </>;
}
