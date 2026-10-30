'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiFetch, getViewAsAccount } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { externalPrivacyText } from '@/lib/i18n-external-privacy';
import { useDraftGuard } from '@/lib/use-draft-guard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Callout } from '@/components/ui/Callout';

type Mode = 'local' | 'basic' | 'custom';
type Policy = { mode: Mode; local_model: string };
export function ExternalPrivacySettings() {
    const { lang } = useI18n();
    const l = (key: Parameters<typeof externalPrivacyText>[1]) => externalPrivacyText(lang, key);
    const [policy, setPolicy] = useState<Policy | null>(null);
    const [mode, setMode] = useState<Mode>('custom');
    const [forbidden, setForbidden] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const [saved, setSaved] = useState(false);
    const dirty = !!policy && mode !== policy.mode;
    useDraftGuard(dirty, l('dirty'), { blocked: busy });
    const load = useCallback(async () => {
        setError(false);
        try {
            const response = await apiFetch('/api/admin/external-privacy', { cache: 'no-store' });
            if (response.status === 403) { setForbidden(true); return; }
            if (!response.ok) throw new Error();
            const data: Policy = await response.json();
            if (!['local', 'basic', 'custom'].includes(data.mode)) throw new Error();
            setPolicy(data); setMode(data.mode);
        } catch { setError(true); }
    }, []);
    useEffect(() => { if (!getViewAsAccount()) void load(); }, [load]);
    if (forbidden || getViewAsAccount()) return null;
    const save = async () => {
        if (busy || mode === 'custom') return;
        setBusy(true); setError(false); setSaved(false);
        try {
            const response = await apiFetch('/api/admin/external-privacy', { method: 'PUT', cache: 'no-store',
                headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'CounselorBot' }, body: JSON.stringify({ mode }) });
            if (!response.ok) throw new Error();
            const data: Policy = await response.json();
            setPolicy(data); setMode(data.mode); setSaved(true);
        } catch { setError(true); } finally { setBusy(false); }
    };
    return <div data-testid="external-privacy-settings"><Card>
        <h4 className="font-semibold text-ink">{l('title')}</h4>
        <p className="mt-2 text-sm text-ink-muted">{l('help')}</p>
        {!policy && !error && <p role="status" className="mt-4 text-sm text-ink-muted">{l('loading')}</p>}
        {policy && <div className="mt-4 space-y-4">
            <label className="block text-sm font-semibold text-ink" htmlFor="external-privacy-mode">{l('mode')}</label>
            <select id="external-privacy-mode" value={mode} disabled={busy} onChange={e => { setMode(e.target.value as Mode); setSaved(false); }} className="h-control w-full rounded-control border border-line-strong bg-surface px-4 py-2 text-ink">
                {policy.mode === 'custom' && <option value="custom" disabled>{l('custom')}</option>}
                <option value="local">{l('local')}</option><option value="basic">{l('basic')}</option>
            </select>
            {mode === 'local' && <p className="text-sm text-ink-muted">{l('localHelp')} <span className="break-all font-mono">{policy.local_model}</span></p>}
            {mode === 'basic' && <><p className="text-sm text-ink-muted">{l('basicHelp')}</p><Callout variant="warning">{l('limits')}</Callout></>}
            {mode === 'custom' && <Callout variant="info">{l('customHelp')}</Callout>}
            <Button disabled={busy || !dirty || mode === 'custom'} onClick={() => void save()}>{l('save')}</Button>
        </div>}
        {error && <div className="mt-4 space-y-2"><Callout variant="danger">{l('error')}</Callout>{!policy && <Button variant="secondary" disabled={busy} onClick={() => void load()}>{l('retry')}</Button>}</div>}
        {saved && <p role="status" className="mt-4 text-sm text-link">{l('saved')}</p>}
    </Card></div>;
}
