'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { classCouncilText, type ClassCouncilTextKey } from '@/lib/i18n-class-council';
import type { CouncilMessage } from '@/lib/class-council';

interface StudentCouncilShare {
    id: number;
    group_id: number;
    group_name: string | null;
    questionnaire_type: string | null;
    shared_at: string | null;
    expires_at: string;
    whole_chat: boolean;
    messages: CouncilMessage[];
}

// Transparency: the student sees exactly what is shared with the class council,
// for which class and until when. No advance consent is required.
export function CouncilStudentSharesCard() {
    const { lang } = useI18n();
    const l = (key: ClassCouncilTextKey) => classCouncilText(lang, key);
    const [shares, setShares] = useState<StudentCouncilShare[] | null>(null);
    const [failed, setFailed] = useState(false);
    const date = (value: string | null) => value ? new Date(value).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' }) : '';

    useEffect(() => {
        const controller = new AbortController();
        apiFetch('/api/user/council-shares', { signal: controller.signal })
            .then(async res => {
                if (!res.ok) throw new Error('failed');
                const data: unknown = await res.json();
                if (!Array.isArray(data)) throw new Error('invalid');
                setShares(data as StudentCouncilShare[]);
            })
            .catch(() => { if (!controller.signal.aborted) setFailed(true); });
        return () => controller.abort();
    }, []);

    if (failed) return <section role="alert" className="rounded-card border border-line p-4 text-sm text-danger">{l('loadError')}</section>;
    if (!shares || shares.length === 0) return null;
    return <section aria-labelledby="student-council-shares-title" className="space-y-3 rounded-card border border-line p-4">
        <h2 id="student-council-shares-title" className="text-lg font-semibold text-ink">{l('studentSharedTitle')}</h2>
        <ul className="divide-y divide-line">
            {shares.map(share => <li key={share.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-semibold text-ink">
                    {share.questionnaire_type || l('sharedConversations')}
                    <span className="ml-2 font-normal text-ink-muted">
                        · {l('studentSharedClass')}: {share.group_name ?? share.group_id}
                        {' '}· {share.whole_chat ? l('shareWholeChat') : l('sharedExtract')}
                        {' '}· {l('sharedUntil')} {date(share.expires_at)}
                    </span>
                </p>
                <div className="space-y-2 text-sm">
                    {share.messages.map((message, index) => <div key={index}>
                        <p className="font-semibold text-ink-body">{message.role === 'student' ? l('studentOne') : 'CounselorBot'}</p>
                        <p className="whitespace-pre-line break-words text-ink-body">{message.text}</p>
                    </div>)}
                </div>
            </li>)}
        </ul>
    </section>;
}
