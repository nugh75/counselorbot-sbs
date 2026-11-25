'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GraduationCap, KeyRound, ShieldCheck, TriangleAlert, User } from 'lucide-react';
import { aiSourceView, isAISource, type AISource } from '@/lib/ai-source';
import { apiFetch } from '@/lib/auth';
import { getActiveSessionCounselorId, subscribeToCounselor } from '@/lib/counselor';
import { useI18n } from '@/lib/i18n-context';
import { useDisclosure } from '@/lib/use-disclosure';
import { ProviderLogo } from './ProviderLogo';

const BADGES = { student: User, teacher: GraduationCap, admin: ShieldCheck };

// #1020: icons only in the bar (key + role badge + provider logo); details open
// on hover, keyboard focus or tap. In a chat: that counselor's source; elsewhere the default.
export function HeaderAISource() {
    const { lang } = useI18n();
    const pathname = usePathname();
    const counselorId = useSyncExternalStore(subscribeToCounselor, getActiveSessionCounselorId, () => null);
    const [source, setSource] = useState<AISource | null>(null);
    const { open, containerRef, triggerRef, triggerProps, onBlur, close } = useDisclosure('ai-source-panel');
    const [hover, setHover] = useState(false);

    useEffect(() => {
        let active = true;
        const query = counselorId ? `?counselor=${counselorId}` : '';
        apiFetch(`/api/me/ai-source${query}`, { cache: 'no-store' })
            .then(res => (res.ok ? res.json() : null))
            .then(data => { if (active) setSource(isAISource(data) ? data : null); })
            .catch(() => { if (active) setSource(null); });
        return () => { active = false; };
    }, [counselorId, pathname]);

    if (!source) return null;
    const view = aiSourceView(source, lang);
    const Badge = BADGES[view.badge];
    if (!Badge) return null;
    const shown = open || hover;
    return (
        <div className="relative" ref={containerRef} onBlur={onBlur}
            onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
            <button type="button" ref={triggerRef} {...triggerProps} aria-label={view.aria} data-source={source.source}
                className="inline-flex min-h-control min-w-control items-center justify-center gap-2 rounded-control px-2 text-ink hover:bg-surface-raised">
                <span className="relative inline-flex h-5 w-5">
                    <KeyRound className="h-5 w-5 text-ink-muted" aria-hidden="true" />
                    <span className="absolute -bottom-1 -right-1.5 grid h-3.5 w-3.5 place-items-center rounded-full bg-surface text-brand">
                        <Badge className="h-3 w-3" aria-hidden="true" data-badge={view.badge} />
                    </span>
                </span>
                <ProviderLogo logo={view.logo} className="h-5 w-5" />
                {view.warning && <TriangleAlert className="h-4 w-4 text-warning-ink" aria-hidden="true" />}
            </button>
            {shown && (
                <div id="ai-source-panel" role="group" aria-label={view.title}
                    className="header-panel absolute right-0 top-full z-[60] mt-2 w-64 rounded-control border border-line bg-surface p-3 text-sm shadow-pop">
                    <p className="font-semibold text-ink">{view.managed}</p>
                    <p className="text-ink-muted">{view.detail}</p>
                    {view.warning && <p className="mt-2 rounded-control bg-warning-soft px-2 py-1.5 text-warning-ink">{view.warning}</p>}
                    <Link href={view.manageHref} onClick={close}
                        className="mt-2 inline-flex min-h-control items-center font-semibold text-link underline">{view.manage}</Link>
                </div>
            )}
        </div>
    );
}
