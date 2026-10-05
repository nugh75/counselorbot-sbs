'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { useI18n } from '@/lib/i18n-context';
import { chatgptRequest, notifyChatGPTChange, type ChatGPTStatus } from '@/lib/chatgpt';
import { getViewAsAccount } from '@/lib/auth';

type LinkCode = { pairing_code: string; expires_at: string };

export function ChatGPTConnectionPanel({ area = 'profilo' }: { area?: 'profilo' | 'docente' }) {
    const { t } = useI18n();
    const router = useRouter();
    const [status, setStatus] = useState<ChatGPTStatus>();
    const [model, setModel] = useState('');
    const [link, setLink] = useState<LinkCode>();
    const [busy, setBusy] = useState(false);
    const [errorKey, setErrorKey] = useState('');
    const [notice, setNotice] = useState('');
    const [copied, setCopied] = useState('');
    const [origin, setOrigin] = useState('');
    const [preview, setPreview] = useState(false);

    const load = useCallback(async () => {
        const next = await chatgptRequest<ChatGPTStatus>();
        setStatus(next);
        setModel(next.model || '');
        return next;
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        setOrigin(window.location.origin);
        if (getViewAsAccount()) { setPreview(true); return; }
        const refreshStatus = () => {
            void chatgptRequest<ChatGPTStatus>('', 'GET', undefined, controller.signal).then(next => {
                setStatus(next); setModel(next.model || '');
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
                        setLink(undefined); setStatus(next); setModel(next.model || ''); notifyChatGPTChange();
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
    });
    const choose = (active: boolean) => act(async () => {
        const next = await chatgptRequest<ChatGPTStatus>('/preference', 'PUT', { use_subscription: active, model: active ? model : null });
        setStatus(next); notifyChatGPTChange();
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

    if (preview || status?.enabled === false) return null;
    if (!status) return errorKey
        ? <Callout variant="danger"><p>{t(errorKey)}</p><Button variant="secondary" onClick={() => void act(async () => { await load(); })}>{t('chatgpt.retry')}</Button></Callout>
        : <p role="status">{t('chatgpt.loading')}</p>;
    return <Card as="section" className="space-y-4" >
        <h2 className="text-xl font-semibold text-slate-900">{t('chatgpt.title')}</h2>
        <p className="text-sm text-slate-600">{t('chatgpt.intro')}</p>
        {status.personal_api_enabled && <p className="text-sm text-slate-600">{t('chatgpt.choiceHelp')}</p>}
        {errorKey && <Callout variant="danger"><p>{t(errorKey)}</p><Button type="button" variant="secondary" disabled={busy} onClick={() => void act(async () => { await load(); })}>{t('chatgpt.retry')}</Button></Callout>}
        {(notice || status?.revocation_pending) && <Callout variant="warning">{t(notice || 'chatgpt.revocation')}</Callout>}
        {!status && !errorKey && <p role="status">{t('chatgpt.loading')}</p>}
        {status && !status.available && <Callout>{t(`chatgpt.errors.${status.reason || 'disabled'}`)}</Callout>}
        {status?.available && !link && (!status.connected || status.needs_reconnect || errorKey === 'chatgpt.errors.reconnect') && <Button type="button" disabled={busy} onClick={() => void act(async () => { setLink(await chatgptRequest<LinkCode>('/link', 'POST')); })}>{t(status.connected || status.needs_reconnect ? 'chatgpt.reconnect' : 'chatgpt.connect')}</Button>}
        {link && <div className="space-y-3 rounded-lg border border-slate-200 p-4" data-testid="chatgpt-link">
            <p className="text-sm">{t(status.macos_helper_available ? 'chatgpt.macosInstructions' : 'chatgpt.instructions')}</p>
            <p className="text-sm font-semibold">{t('chatgpt.code')}</p>
            <code data-testid="chatgpt-pairing-code" className="block select-all break-all rounded bg-slate-50 p-3 text-sm">{link.pairing_code}</code>
            <Button type="button" variant="secondary" onClick={() => void copy(link.pairing_code, 'code')}>{t(copied === 'code' ? 'chatgpt.copied' : 'chatgpt.copy')}</Button>
            <p className="text-xs text-slate-600">{t('chatgpt.remote')}</p>
            {status.macos_helper_available && <div className="space-y-2">
                <a className="inline-flex min-h-11 items-center text-sm font-semibold text-indigo-700 underline" href="/api/chatgpt/helper/macos" download="CounselorBot-ChatGPT.zip">{t('chatgpt.macosDownload')}</a>
                <p className="text-xs text-slate-600">{t('chatgpt.macosSecurity')}</p>
            </div>}
            <details open={status.macos_helper_available ? undefined : true} className="space-y-3">
                <summary className="cursor-pointer text-sm font-semibold">{t('chatgpt.manual')}</summary>
                <p className="text-sm">{t('chatgpt.instructions')}</p>
                <a className="inline-flex min-h-11 items-center text-sm font-semibold text-indigo-700 underline" href="/api/chatgpt/helper" download="chatgpt-connect.py">{t('chatgpt.download')}</a>
                <p className="text-sm font-semibold">{t('chatgpt.command')}</p>
                <code className="block break-all rounded bg-slate-50 p-3 text-sm">{command}</code>
                <Button type="button" variant="secondary" onClick={() => void copy(command, 'command')}>{t(copied === 'command' ? 'chatgpt.copied' : 'chatgpt.copy')}</Button>
            </details>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => void act(async () => { await chatgptRequest('/link', 'DELETE'); setLink(undefined); await load(); })}>{t('chatgpt.cancel')}</Button>
        </div>}
        {status?.connected && <div className="space-y-3">
            <p role="status" className="break-words text-sm font-semibold">{t('chatgpt.connected')}{status.email ? ` · ${status.email}` : ''}</p>
            <label className="block text-sm font-semibold" htmlFor="chatgpt-model">{t('chatgpt.model')}</label>
            <select id="chatgpt-model" value={model} disabled={busy || !!link || !status.available} onChange={event => setModel(event.target.value)} className="min-h-11 w-full min-w-0 rounded-md border border-slate-200 bg-white p-2 text-sm">
                <option value="">{t('chatgpt.choose')}</option>
                {status.models.map(item => <option key={item.slug} value={item.slug}>{item.display_name}</option>)}
            </select>
            <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" disabled={busy || !!link || !status.available} onClick={() => void refresh()}>{t('chatgpt.refresh')}</Button>
                <Button type="button" disabled={busy || !!link || !status.available || !model || !status.models.some(item => item.slug === model)} onClick={() => void choose(true)}>{t('chatgpt.save')}</Button>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => void disconnect()}>{t('chatgpt.disconnect')}</Button>
            </div>
        </div>}
        {status?.use_subscription ? <div className="space-y-2"><p role="status" className="text-sm font-semibold">{t('chatgpt.active')} · {status.model}</p><Button type="button" variant="secondary" disabled={busy} onClick={() => void choose(false)}>{t('chatgpt.institution')}</Button></div> : status?.connected && <p className="text-sm text-slate-600">{t('chatgpt.inactive')}</p>}
        {status?.needs_reconnect && <Callout variant="warning">{t('chatgpt.errors.reconnect')}</Callout>}
        {status?.registered && !status.connected && <Button type="button" variant="secondary" disabled={busy || !!link} onClick={() => void disconnect(true)}>{t('chatgpt.forget')}</Button>}
        {(status?.connected || status?.use_subscription) && <a href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-sm text-indigo-700 underline">{t('chatgpt.usage')}</a>}
        <p className="text-xs text-slate-600">{t('chatgpt.billing')}</p>
        <p className="text-xs text-slate-600">{t('chatgpt.privacy')}</p>
    </Card>;
}
