'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CounselorSelector } from '@/components/questionnaire/CounselorSelector';
import { LearnerProfileCard } from './LearnerProfileCard';
import { Button } from '@/components/ui/Button';
import { fetchAccountPreferences, saveAccountPreferences, safeAccountNext, type AccountPreferences } from '@/lib/account-preferences';
import { getSelectedCounselorId } from '@/lib/counselor';
import { useI18n } from '@/lib/i18n-context';

export function AccountSetup({ counselorOnly = false }: { counselorOnly?: boolean }) {
    const router = useRouter();
    const { t } = useI18n();
    const [prefs, setPrefs] = useState<AccountPreferences | null>(null);
    const [error, setError] = useState(false);
    const [busy, setBusy] = useState(false);
    const [retry, setRetry] = useState(0);
    const [instrument, setInstrument] = useState<string | undefined>();
    useEffect(() => {
        let active = true;
        setError(false);
        const params = new URLSearchParams(window.location.search);
        const destination = new URL(safeAccountNext(params.get('next')), window.location.origin);
        setInstrument(params.get('instrument') ?? destination.searchParams.get('start') ?? destination.searchParams.get('instrument') ?? undefined);
        void fetchAccountPreferences().then(async p => {
            if (!active) return;
            setPrefs(p);
            if (!counselorOnly && p.counselor_ready && p.notebook_ready) {
                await saveAccountPreferences(p.counselor_id, true);
                if (active) router.replace(safeAccountNext(new URLSearchParams(window.location.search).get('next')));
            }
        }).catch(() => { if (active) setError(true); });
        return () => { active = false; };
    }, [retry, counselorOnly, router]);
    const finish = async (id: number | null, complete = false) => {
        if (busy) return;
        setBusy(true); setError(false);
        try {
            const updated = await saveAccountPreferences(id, complete);
            setPrefs(updated);
            if (counselorOnly || updated.notebook_ready) {
                router.replace(safeAccountNext(new URLSearchParams(window.location.search).get('next')));
            }
        } catch { setError(true); }
        finally { setBusy(false); }
    };
    return <div className="page-wide space-y-6">
        <header><h1 className="font-display text-3xl font-bold text-slate-900">{t(counselorOnly ? 'setup.counselor' : 'setup.title')}</h1>
            <p className="mt-3 text-slate-600">{t(counselorOnly ? 'setup.counselorBody' : 'setup.body')}</p>
            {prefs?.counselor_id && !prefs.counselor_ready && <p className="mt-3 text-amber-800" role="status">{t('counselor.unavailable')}</p>}
            {instrument && <p className="mt-3 text-amber-800" role="status">{t('setup.compatibility', { instrument })}</p>}
        </header>
        {error && <div role="alert"><p>{t('setup.error')}</p><Button onClick={() => setRetry(n => n + 1)}>{t('setup.retry')}</Button></div>}
        {prefs && (counselorOnly || !prefs.counselor_ready ?
            <CounselorSelector questionnaireType={instrument} questionnaireName={instrument} initialSelectedId={prefs.counselor_id ?? getSelectedCounselorId()} busy={busy}
                onContinue={id => void finish(id)} onBack={() => router.push('/')} /> :
            !prefs.notebook_ready ? <LearnerProfileCard key={retry} variant="review" requireInitial onUnavailable={() => setError(true)} onDone={() => void finish(prefs.counselor_id, true)} /> :
            <Button disabled={busy} onClick={() => void finish(prefs.counselor_id, true)}>{t('counselor.continue')}</Button>)}
    </div>;
}
