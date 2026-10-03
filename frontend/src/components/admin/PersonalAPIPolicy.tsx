'use client';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { personalAPIText } from '@/lib/i18n-personal-api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';

type Policy = { enabled: boolean; encryption_ready: boolean };
export function PersonalAPIPolicy() {
    const { lang } = useI18n();
    const l = (key: Parameters<typeof personalAPIText>[1]) => personalAPIText(lang, key);
    const [policy, setPolicy] = useState<Policy | null>(null);
    const [forbidden, setForbidden] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [saved, setSaved] = useState(false);
    const load = useCallback(async () => {
        setError(false);
        try {
            const response = await fetch('/api/admin/personal-api-policy', { cache: 'no-store' });
            if (response.status === 403) { setForbidden(true); return; }
            if (!response.ok) throw new Error();
            setPolicy(await response.json());
        } catch { setError(true); }
    }, []);
    useEffect(() => { void load(); }, [load]);
    if (forbidden) return null;
    const toggle = async (enabled: boolean) => {
        const previous = policy;
        setPolicy(current => current ? { ...current, enabled } : current);
        setBusy(true); setError(false); setSaved(false);
        try {
            const response = await fetch('/api/admin/personal-api-policy', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }),
            });
            if (!response.ok) throw new Error();
            setPolicy(await response.json()); setSaved(true);
        } catch { setPolicy(previous); setError(true); } finally { setBusy(false); }
    };
    return <Card>
        <h4 className="font-semibold text-slate-900">{l('title')}</h4>
        <p className="mt-2 text-sm text-slate-600">{l('adminHelp')}</p>
        {policy && <label className="mt-3 flex min-h-11 items-center gap-3 text-sm font-semibold text-slate-800">
            <input type="checkbox" checked={policy.enabled} disabled={busy || (!policy.enabled && !policy.encryption_ready)} onChange={event => void toggle(event.target.checked)} />
            {l('adminToggle')}
        </label>}
        {policy && !policy.encryption_ready && <Callout variant="warning" className="mt-3">{l('encryptionMissing')}</Callout>}
        {error && <div className="mt-3 space-y-2"><Callout variant="danger">{l('error')}</Callout><Button variant="secondary" onClick={() => void load()} disabled={busy}>{l('retry')}</Button></div>}
        {saved && <p role="status" className="mt-3 text-sm text-indigo-700">{l('saved')}</p>}
    </Card>;
}
