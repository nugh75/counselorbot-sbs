'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch, getViewAsAccount } from '@/lib/auth';
import { notifyChatGPTChange } from '@/lib/chatgpt';
import { useI18n } from '@/lib/i18n-context';
import { personalAPIText } from '@/lib/i18n-personal-api';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';

type Policy = { enabled: boolean; encryption_ready: boolean; reason: string | null; key_source: 'managed' | 'environment' };
export function PersonalAPIPolicy() {
    const { lang } = useI18n();
    const l = (key: Parameters<typeof personalAPIText>[1]) => personalAPIText(lang, key);
    const [policy, setPolicy] = useState<Policy | null>(null);
    const [forbidden, setForbidden] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [saved, setSaved] = useState(false);
    const [reason, setReason] = useState<'error' | 'keyMissing' | 'notConfigured'>('error');
    const load = useCallback(async () => {
        setError(false);
        try {
            const response = await apiFetch('/api/admin/personal-api-policy', { cache: 'no-store' });
            if (response.status === 403) { setForbidden(true); return; }
            if (!response.ok) throw new Error();
            setPolicy(await response.json());
        } catch { setError(true); }
    }, []);
    useEffect(() => { if (!getViewAsAccount()) void load(); }, [load]);
    if (forbidden || getViewAsAccount()) return null;
    const toggle = async (enabled: boolean) => {
        const previous = policy;
        setPolicy(current => current ? { ...current, enabled } : current);
        setBusy(true); setError(false); setSaved(false);
        try {
            const response = await apiFetch('/api/admin/personal-api-policy', {
                method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CounselorBot' }, cache: 'no-store', body: JSON.stringify({ enabled }),
            });
            if (!response.ok) {
                const failure = await response.json();
                setReason(failure.detail === 'personalAPI.errors.keyMissing' ? 'keyMissing' : failure.detail === 'personalAPI.errors.notConfigured' ? 'notConfigured' : 'error');
                throw new Error();
            }
            setPolicy(await response.json()); setSaved(true); notifyChatGPTChange();
        } catch { setPolicy(previous); setError(true); } finally { setBusy(false); }
    };
    return <div data-testid="personal-api-settings"><Card>
        <h4 className="font-semibold text-slate-900">{l('title')}</h4>
        <p className="mt-2 text-sm text-slate-600">{l('adminHelp')}</p>
        {policy && <label className="mt-3 flex min-h-11 items-center gap-3 text-sm font-semibold text-slate-800">
            <input type="checkbox" checked={policy.enabled} disabled={busy} onChange={event => void toggle(event.target.checked)} />
            {l('adminToggle')}
        </label>}
        {policy && <p className="mt-3 text-sm text-slate-600">{l(policy.encryption_ready ? 'protected' : 'automatic')}</p>}
        {policy?.reason === 'keyMissing' && <Callout variant="warning" className="mt-3">{l('keyMissing')}</Callout>}
        <p className="mt-3 text-xs text-slate-600">{l('backup')}</p>
        {error && <div className="mt-3 space-y-2"><Callout variant="danger">{l(reason)}</Callout><Button variant="secondary" onClick={() => void load()} disabled={busy}>{l('retry')}</Button></div>}
        {saved && <p role="status" className="mt-3 text-sm text-indigo-700">{l('saved')}</p>}
    </Card></div>;
}
