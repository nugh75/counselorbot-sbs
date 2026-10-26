'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Loader2, RefreshCw, ShieldOff, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { localPairingText, type LocalPairingTextKey } from '@/lib/i18n-local-pairing';
import { formatPersonalCode, type LocalDeviceClass, type LocalStudentDevice } from '@/lib/local-pairing';

type RegeneratedCode = { username: string; pseudonym: string; code: string };

export function TeacherDevicesPanel({ groupId }: { groupId?: number }) {
    const { lang } = useI18n();
    const l = (key: LocalPairingTextKey, vars?: Record<string, string | number>) => localPairingText(lang, key, vars);
    const [classes, setClasses] = useState<LocalDeviceClass[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [actionError, setActionError] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [revokeId, setRevokeId] = useState<number | null>(null);
    const [regenerated, setRegenerated] = useState<RegeneratedCode | null>(null);
    const [copied, setCopied] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(false);
        try {
            const response = await apiFetch('/api/local-auth/devices');
            if (!response.ok) throw new Error('devices read failed');
            const payload = await response.json() as { classes?: LocalDeviceClass[] };
            const rows = Array.isArray(payload.classes) ? payload.classes : [];
            setClasses(groupId === undefined ? rows : rows.filter(row => row.group_id === groupId));
        } catch {
            setClasses([]);
            setLoadError(true);
        } finally {
            setLoading(false);
        }
    }, [groupId]);

    useEffect(() => { void load(); }, [load]);

    const runAction = async (key: string, action: () => Promise<void>) => {
        if (busy) return;
        setBusy(key);
        setActionError(false);
        try {
            await action();
        } catch {
            setActionError(true);
        } finally {
            setBusy(null);
        }
    };

    const approve = (device: LocalStudentDevice) => runAction(`approve:${device.id}`, async () => {
        const response = await apiFetch(`/api/local-auth/devices/${device.id}/approve`, { method: 'POST' });
        if (!response.ok) throw new Error('approve failed');
        await load();
    });

    const revoke = (device: LocalStudentDevice) => runAction(`revoke:${device.id}`, async () => {
        const response = await apiFetch(`/api/local-auth/devices/${device.id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('revoke failed');
        setRevokeId(null);
        await load();
    });

    const regenerate = (device: LocalStudentDevice) => runAction(`regenerate:${device.id}`, async () => {
        const response = await apiFetch(`/api/local-auth/students/${encodeURIComponent(device.username)}/personal-code`, { method: 'POST' });
        if (!response.ok) throw new Error('regenerate failed');
        const payload = await response.json() as { personal_code: string };
        setCopied(false);
        setRegenerated({ username: device.username, pseudonym: device.pseudonym, code: payload.personal_code });
    });

    const copyRegenerated = async () => {
        if (!regenerated || !navigator.clipboard) return;
        try {
            await navigator.clipboard.writeText(formatPersonalCode(regenerated.code));
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
        } catch {
            // Il campo resta selezionabile anche senza permesso degli appunti.
        }
    };

    return (
        <section aria-label={l('devicesTitle')} className="space-y-4">
            <div className="flex justify-end">
                <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading || busy !== null}>
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
                    {l('refresh')}
                </Button>
            </div>

            {regenerated && (
                <Callout variant="warning" title={l('regeneratedCode', { pseudonym: regenerated.pseudonym })}>
                    <div className="space-y-3">
                        <p>{l('regeneratedHint')}</p>
                        <div className="flex flex-col gap-2 sm:flex-row">
                            <label htmlFor={`regenerated-${regenerated.username}`} className="sr-only">{l('personalCodeLabel')}</label>
                            <input
                                id={`regenerated-${regenerated.username}`}
                                readOnly
                                value={formatPersonalCode(regenerated.code)}
                                onFocus={event => event.target.select()}
                                className="min-h-11 min-w-0 flex-1 rounded-md border border-amber-300 bg-white px-3 text-center font-mono text-lg font-bold tracking-widest text-slate-900"
                            />
                            <Button type="button" variant="secondary" onClick={() => void copyRegenerated()}>
                                {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                                {l(copied ? 'copied' : 'copy')}
                            </Button>
                        </div>
                    </div>
                </Callout>
            )}
            {actionError && <Callout variant="danger">{l('actionError')}</Callout>}
            {loadError && (
                <Callout variant="danger" title={l('loadError')}>
                    <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>{l('refresh')}</Button>
                </Callout>
            )}
            {loading && classes.length === 0 && (
                <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />{l('loading')}
                </p>
            )}
            {!loading && !loadError && classes.length === 0 && (
                <Card><p className="text-sm text-slate-600">{l(groupId === undefined ? 'noDevices' : 'noClassDevices')}</p></Card>
            )}

            {classes.map(group => (
                <Card key={group.group_id}>
                    <section aria-labelledby={`device-class-${group.group_id}`} className="space-y-4">
                        <h2 id={`device-class-${group.group_id}`} className="border-b border-slate-100 pb-3 text-lg font-bold text-slate-800">
                            {group.group_name}
                        </h2>
                        <ul className="divide-y divide-slate-100">
                            {group.devices.map(device => (
                                <li key={device.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                        <div className="min-w-0 space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="font-semibold text-slate-900">{device.pseudonym}</h3>
                                                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${device.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
                                                    {l(device.status === 'active' ? 'activeStatus' : 'pendingStatus')}
                                                </span>
                                            </div>
                                            <p className="text-sm text-slate-600">{device.device_label || l('unnamedDevice')}</p>
                                            <p className="text-xs text-slate-500">
                                                <time dateTime={device.created_at}>{l('pairedAt', { date: new Date(device.created_at).toLocaleString(lang) })}</time>
                                                {' · '}
                                                <time dateTime={device.last_seen_at}>{l('lastSeen', { date: new Date(device.last_seen_at).toLocaleString(lang) })}</time>
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {device.status === 'pending' && (
                                                <Button type="button" variant="success" size="sm" disabled={busy !== null} onClick={() => void approve(device)}>
                                                    {busy === `approve:${device.id}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UserCheck className="h-4 w-4" aria-hidden />}
                                                    {l('approve')}
                                                </Button>
                                            )}
                                            <Button type="button" variant="secondary" size="sm" disabled={busy !== null} onClick={() => void regenerate(device)}>
                                                {busy === `regenerate:${device.id}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />}
                                                {l('regenerate')}
                                            </Button>
                                            <Button type="button" variant="danger" size="sm" disabled={busy !== null} onClick={() => setRevokeId(device.id)}>
                                                <ShieldOff className="h-4 w-4" aria-hidden />{l('revoke')}
                                            </Button>
                                        </div>
                                    </div>
                                    {revokeId === device.id && (
                                        <div role="group" aria-label={l('revokeConfirm')} className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                                            <p className="w-full text-sm text-red-800">{l('revokeConfirm')}</p>
                                            <Button type="button" variant="danger" size="sm" disabled={busy !== null} onClick={() => void revoke(device)}>
                                                {busy === `revoke:${device.id}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                                                {l(busy === `revoke:${device.id}` ? 'actionBusy' : 'revoke')}
                                            </Button>
                                            <Button type="button" variant="secondary" size="sm" disabled={busy !== null} onClick={() => setRevokeId(null)}>{l('cancel')}</Button>
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </section>
                </Card>
            ))}
        </section>
    );
}
