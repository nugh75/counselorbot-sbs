'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getIdentity } from '@/lib/auth';
import { fetchAccountPreferences, saveAccountPreferences } from '@/lib/account-preferences';
import { setSelectedCounselorId } from '@/lib/counselor';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';

export function AccountSetupGate({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { t } = useI18n();
    const [loadedPath, setLoadedPath] = useState<string | null>(null);
    const [error, setError] = useState(false);
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        let active = true;
        void (async () => {
            try {
                const identity = await getIdentity();
                if (!active) return;
                setError(false);
                if (!identity?.authenticated) { setLoadedPath(pathname); return; }
                const prefs = await fetchAccountPreferences();
                if (!active) return;
                if (prefs.counselor_ready && prefs.notebook_ready && !prefs.setup_completed) {
                    await saveAccountPreferences(prefs.counselor_id, true);
                    if (!active) return;
                }
                const params = new URLSearchParams(window.location.search);
                const resuming = pathname === '/' && Boolean(params.get('frozen') || params.get('resume') || params.get('session_id'));
                // A resumed conversation restores its own counselor in the page.
                if (!resuming) setSelectedCounselorId(prefs.counselor_ready ? prefs.counselor_id : null);
                const exempt = ['/inizia', '/counselor', '/profilo', '/admin', '/docente', '/guide', '/login', '/register', '/telegram-link', '/questionario'].some(p => pathname === p || pathname.startsWith(`${p}/`));
                const intro = pathname === '/' && !params.get('view') && !params.get('start');
                if (!exempt && !intro && !resuming && (!prefs.counselor_ready || !prefs.notebook_ready)) {
                    router.replace(`${prefs.notebook_ready ? "/counselor" : "/inizia"}?next=${encodeURIComponent(pathname + window.location.search)}`);
                    return;
                }
                setLoadedPath(pathname);
            } catch { if (active) setError(true); }
        })();
        return () => { active = false; };
    }, [pathname, router, retry]);
    if (error) return <div className="page-wide space-y-4" role="alert"><p>{t('setup.error')}</p><Button onClick={() => setRetry(n => n + 1)}>{t('setup.retry')}</Button></div>;
    if (loadedPath !== pathname) return <div className="mx-auto mt-16 h-1 w-24 animate-pulse rounded bg-slate-200" aria-busy="true" />;
    return children;
}
