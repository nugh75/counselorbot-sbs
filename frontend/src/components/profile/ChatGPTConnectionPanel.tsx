'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { useI18n } from '@/lib/i18n-context';
import { chatgptRequest, notifyChatGPTChange, type ChatGPTStatus } from '@/lib/chatgpt';
import { getViewAsAccount } from '@/lib/auth';
import { currentDeviceOs, type DeviceOs } from '@/lib/device-os';

type LinkCode = { pairing_code: string; expires_at: string };

export function ChatGPTConnectionPanel({ area = 'profilo' }: { area?: 'profilo' | 'docente' }) {
    const { t } = useI18n();
    const router = useRouter();
    const [status, setStatus] = useState<ChatGPTStatus>();
    const [link, setLink] = useState<LinkCode>();
    const [busy, setBusy] = useState(false);
    const [errorKey, setErrorKey] = useState('');
    const [notice, setNotice] = useState('');
    const [copied, setCopied] = useState('');
    const [origin, setOrigin] = useState('');
    const [preview, setPreview] = useState(false);
    // #134: the helper offered first follows the user's computer.
    const [device, setDevice] = useState<DeviceOs>('unknown');
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => { setDevice(currentDeviceOs()); }, []);
    useEffect(() => {
        if (!link) return;
        const tick = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(tick);
    }, [link]);

    const load = useCallback(async () => {
        const next = await chatgptRequest<ChatGPTStatus>();
        setStatus(next);
        return next;
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        setOrigin(window.location.origin);
        if (getViewAsAccount()) { setPreview(true); return; }
        const refreshStatus = () => {
            void chatgptRequest<ChatGPTStatus>('', 'GET', undefined, controller.signal).then(next => {
                setStatus(next);
                if (!next.enabled) setLink(undefined);
            }).catch(() => { if (!controller.signal.aborted) setErrorKey('chatgpt.errors.unavailable'); });
        };
        refreshStatus();
        window.addEventListener('focus', refreshStatus);
        window.addEventListener('chatgpt-connection-changed', refreshStatus);
        return () => { controller.abort(); window.removeEventListener('focus', refreshStatus); window.removeEventListener('chatgpt-connection-changed', refreshStatus); };
    }, []);

    useEffect(() => {
        if (status?.enabled === false) router.replace(`/${area}`);
    }, [status?.enabled, area, router]);

    const act = async (operation: () => Promise<void>) => {
        setBusy(true); setErrorKey(''); setNotice(''); setCopied('');
        try { await operation(); }
        catch (failure) { setErrorKey(failure instanceof Error ? failure.message : 'chatgpt.errors.unavailable'); }
        finally { setBusy(false); }
    };

    useEffect(() => {
        if (!link) return;
        const controller = new AbortController();
        let timeout: ReturnType<typeof setTimeout>;
        const poll = async () => {
            if (Date.now() >= Date.parse(link.expires_at)) {
                setLink(undefined); setErrorKey('chatgpt.errors.linkExpired'); return;
            }
            try {
                const next = await chatgptRequest<ChatGPTStatus>('', 'GET', undefined, controller.signal);
                if (next.connected && !next.pending_link) {
                    try {
                        const catalog = await chatgptRequest<{ models: ChatGPTStatus['models'] }>('/models', 'POST', undefined, controller.signal);
                        next.models = catalog.models;
                    } catch (failure) {
                        if (!controller.signal.aborted) setErrorKey(failure instanceof Error ? failure.message : 'chatgpt.errors.unavailable');
                    }
                    if (!controller.signal.aborted) {
                        setLink(undefined); setStatus(next); notifyChatGPTChange();
                    }
                    return;
                }
            } catch (failure) {
                if (!controller.signal.aborted) setErrorKey(failure instanceof Error ? failure.message : 'chatgpt.errors.unavailable');
            }
            if (!controller.signal.aborted) timeout = setTimeout(poll, 3000);
        };
        timeout = setTimeout(poll, 1000);
        return () => { controller.abort(); clearTimeout(timeout); };
    }, [link]);

    const refresh = () => act(async () => {
        const catalog = await chatgptRequest<{ models: ChatGPTStatus['models'] }>('/models', 'POST');
        setStatus(previous => previous ? { ...previous, models: catalog.models } : previous);
        notifyChatGPTChange(); // The counselor choices list the refreshed models.
    });
    const disconnect = (forget = false) => act(async () => {
        const result = await chatgptRequest<{ revocation_confirmed: boolean }>(forget ? '?forget_registration=true' : '', 'DELETE');
        setLink(undefined); await load(); notifyChatGPTChange();
        if (!result.revocation_confirmed) setNotice('chatgpt.revocation');
    });
    const copy = async (value: string, target: string) => {
        try { await navigator.clipboard.writeText(value); setCopied(target); }
        catch { setCopied(''); } // The selectable text remains available.
    };
    const command = `python3 chatgpt-connect.py --server '${origin}'`;
    const sshCommand = `${command} --no-browser --callback-port 1455`;

    if (preview || status?.enabled === false) return null;
    if (!status) return errorKey
        ? <Callout variant="danger"><p>{t(errorKey)}</p><Button variant="secondary" onClick={() => void act(async () => { await load(); })}>{t('chatgpt.retry')}</Button></Callout>
        : <p role="status">{t('chatgpt.loading')}</p>;
    const startLink = () => act(async () => { setLink(await chatgptRequest<LinkCode>('/link', 'POST')); });
    // Wizard state (plan §4/§7): error > waiting > connected > not connected.
    const failed = !link && Boolean(errorKey) && status.available;
    const remaining = link ? Math.max(0, Math.round((Date.parse(link.expires_at) - now) / 1000)) : 0;
    const countdown = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
    const osName = t(device === 'windows' ? 'chatgpt.osWindows' : device === 'macos' ? 'chatgpt.osMacos' : device === 'linux' ? 'chatgpt.osLinux' : 'chatgpt.osUnknown');
    const windowsLink = status.windows_helper_available && <div key="windows" className="space-y-1">
        <a className="inline-flex min-h-11 items-center text-sm font-semibold text-indigo-700 underline" href="/api/chatgpt/helper/windows" download="CounselorBot-ChatGPT-Windows.zip">{t('chatgpt.windowsDownload')}</a>
        <p className="text-xs text-slate-600">{t('chatgpt.windowsSecurity').replace('{origin}', origin)}</p>
    </div>;
    const macosLink = status.macos_helper_available && <div key="macos" className="space-y-1">
        <a className="inline-flex min-h-11 items-center text-sm font-semibold text-indigo-700 underline" href="/api/chatgpt/helper/macos" download="CounselorBot-ChatGPT.zip">{t('chatgpt.macosDownload')}</a>
        <p className="text-xs text-slate-600">{t('chatgpt.macosSecurity')}</p>
    </div>;
    const pythonLink = <div key="python" className="space-y-1">
        <a className="inline-flex min-h-11 items-center text-sm font-semibold text-indigo-700 underline" href="/api/chatgpt/helper" download="chatgpt-connect.py">{t('chatgpt.pythonHelper')}</a>
    </div>;
    // The detected system's helper first (Python when no packaged one exists); the rest stay one click away.
    const primary = device === 'windows' ? (windowsLink || pythonLink) : device === 'macos' ? (macosLink || pythonLink)
        : device === 'linux' ? pythonLink : null;
    const others = [windowsLink, macosLink, pythonLink].filter(item => item && item !== primary);

    return <Card as="section" className="space-y-4" data-testid="chatgpt-wizard"
        data-state={failed ? 'error' : link ? 'waiting' : status.connected && !status.needs_reconnect ? 'connected' : 'not_connected'}>
        <h2 className="text-xl font-semibold text-slate-900">{t('chatgpt.title')}</h2>
        <p className="text-sm text-slate-600">{t('chatgpt.intro')}</p>
        {(notice || status?.revocation_pending) && <Callout variant="warning">{t(notice || 'chatgpt.revocation')}</Callout>}
        {status && !status.available && <Callout>{t(`chatgpt.errors.${status.reason || 'disabled'}`)}</Callout>}
        {status.available && !status.connected && device !== 'unsupported' && <p className="text-sm text-slate-700">{t('chatgpt.detected').replace('{os}', osName)}</p>}

        {/* State 4: expired or failed, with a retry that starts a new link without reloading. */}
        {failed && <Callout variant="danger">
            <p>{t(errorKey)}</p>
            {device !== 'unsupported' && <Button type="button" variant="secondary" disabled={busy} onClick={() => void startLink()}>{t('chatgpt.retryLink')}</Button>}
            <details className="mt-2 text-sm"><summary className="cursor-pointer font-medium">{t('chatgpt.troubleshooting')}</summary><p className="mt-1">{t('chatgpt.troubleshootingBody')}</p></details>
        </Callout>}

        {/* State 1: not connected. Phones, tablets and Chromebooks get an explanation and no actions. */}
        {status.available && !link && !failed && (!status.connected || status.needs_reconnect) && (device === 'unsupported'
            ? <Callout>{t('chatgpt.unsupported')}</Callout>
            : <Button type="button" disabled={busy} onClick={() => void startLink()}>{t(status.connected || status.needs_reconnect ? 'chatgpt.reconnect' : 'chatgpt.connect')}</Button>)}

        {/* State 2: waiting for the sign-in, in three numbered steps. */}
        {link && <div className="space-y-4 rounded-lg border border-slate-200 p-4" data-testid="chatgpt-link">
            <ol className="space-y-4">
                <li className="space-y-2">
                    <p className="text-sm font-semibold">{`1. ${t('chatgpt.stepDownload')}`}</p>
                    {primary}
                    {others.length > 0 && <details className="space-y-2" open={primary ? undefined : true}>
                        <summary className="cursor-pointer text-sm font-medium text-slate-700">{t('chatgpt.otherSystems')}</summary>
                        <div className="space-y-2 pt-1">{others}</div>
                    </details>}
                </li>
                <li className="space-y-2">
                    <p className="text-sm font-semibold">{`2. ${t('chatgpt.stepCode')}`}</p>
                    <code data-testid="chatgpt-pairing-code" className="block select-all break-all rounded bg-slate-50 p-3 text-sm">{link.pairing_code}</code>
                    <div className="flex flex-wrap items-center gap-3">
                        <Button type="button" variant="secondary" onClick={() => void copy(link.pairing_code, 'code')}>{t(copied === 'code' ? 'chatgpt.copied' : 'chatgpt.copy')}</Button>
                        {/* Not announced every second: the timer is visual, the expiry is announced as an error. */}
                        <span role="timer" aria-live="off" className="text-xs text-slate-600">{t('chatgpt.expiresIn').replace('{time}', countdown)}</span>
                    </div>
                    <span role="status" className="sr-only">{copied === 'code' ? t('chatgpt.copied') : ''}</span>
                </li>
                <li className="space-y-1">
                    <p className="text-sm font-semibold">{`3. ${t('chatgpt.stepSignIn')}`}</p>
                    <p role="status" className="text-xs text-slate-600">{t('chatgpt.waiting')}</p>
                </li>
            </ol>
            <p className="text-xs text-slate-600">{t('chatgpt.remote')}</p>
            <details className="space-y-3">
                <summary className="cursor-pointer text-sm font-semibold">{t('chatgpt.manual')}</summary>
                <p className="text-sm">{t('chatgpt.instructions')}</p>
                <a className="inline-flex min-h-11 items-center text-sm font-semibold text-indigo-700 underline" href="/api/chatgpt/helper" download="chatgpt-connect.py">{t('chatgpt.download')}</a>
                <p className="text-sm font-semibold">{t('chatgpt.command')}</p>
                <code className="block break-all rounded bg-slate-50 p-3 text-sm">{command}</code>
                <Button type="button" variant="secondary" onClick={() => void copy(command, 'command')}>{t(copied === 'command' ? 'chatgpt.copied' : 'chatgpt.copy')}</Button>
                <p className="text-sm">{t('chatgpt.sshInstructions')}</p>
                <code data-testid="chatgpt-ssh-command" className="block break-all rounded bg-slate-50 p-3 text-sm">{sshCommand}</code>
                <Button type="button" variant="secondary" onClick={() => void copy(sshCommand, 'ssh')}>{t(copied === 'ssh' ? 'chatgpt.copied' : 'chatgpt.copy')}</Button>
            </details>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void act(async () => { await chatgptRequest('/link', 'DELETE'); setLink(undefined); await load(); })}>{t('chatgpt.cancel')}</Button>
        </div>}

        {/* State 3: connected. Which counselor uses which model is chosen with the other sources (#200). */}
        {status?.connected && <div className="space-y-3">
            <p role="status" className="break-words text-sm font-semibold">{t('chatgpt.connected')}{status.email ? ` · ${status.email}` : ''}</p>
            <p className="text-sm text-slate-600">{t('chatgpt.chooseBelow')}</p>
            <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" disabled={busy || !!link || !status.available} onClick={() => void refresh()}>{t('chatgpt.refresh')}</Button>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => void disconnect()}>{t('chatgpt.disconnect')}</Button>
            </div>
        </div>}
        {status?.use_subscription ? <p role="status" className="text-sm font-semibold">{t('chatgpt.active')} · {status.model}</p> : status?.connected && <p className="text-sm text-slate-600">{t('chatgpt.inactive')}</p>}
        {status?.needs_reconnect && <Callout variant="warning">{t('chatgpt.errors.reconnect')}</Callout>}
        {status?.registered && !status.connected && <Button type="button" variant="secondary" disabled={busy || !!link} onClick={() => void disconnect(true)}>{t('chatgpt.forget')}</Button>}
        {(status?.connected || status?.use_subscription) && <a href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm text-indigo-700 underline">{t('chatgpt.usage')}</a>}
        <p className="text-xs text-slate-600">{t('chatgpt.billing')}</p>
        <p className="text-xs text-slate-600">{t('chatgpt.privacy')}</p>
    </Card>;
}
