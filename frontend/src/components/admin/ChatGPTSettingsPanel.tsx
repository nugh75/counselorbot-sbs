'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { useI18n } from '@/lib/i18n-context';
import { getViewAsAccount } from '@/lib/auth';
import { chatgptInstallationRequest, notifyChatGPTChange, type ChatGPTInstallationStatus } from '@/lib/chatgpt';

export function ChatGPTSettingsPanel() {
    const { t } = useI18n();
    const [settings, setSettings] = useState<ChatGPTInstallationStatus>();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        if (getViewAsAccount()) { setHidden(true); return; }
        const controller = new AbortController();
        void chatgptInstallationRequest('GET', undefined, controller.signal).then(setSettings).catch(failure => {
            if (controller.signal.aborted) return;
            if (failure instanceof Error && failure.message === 'chatgpt.errors.adminOnly') setHidden(true);
            else setError(failure instanceof Error ? failure.message : 'chatgpt.errors.unavailable');
        });
        return () => controller.abort();
    }, []);

    const update = async () => {
        if (!settings) return;
        setBusy(true); setError(''); setSaved(false);
        try {
            setSettings(await chatgptInstallationRequest('PUT', { enabled: !settings.enabled }));
            setSaved(true); notifyChatGPTChange();
        } catch (failure) {
            setError(failure instanceof Error ? failure.message : 'chatgpt.errors.unavailable');
        } finally { setBusy(false); }
    };
    const retry = async () => {
        setBusy(true); setError('');
        try { setSettings(await chatgptInstallationRequest()); }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'chatgpt.errors.unavailable'); }
        finally { setBusy(false); }
    };

    if (hidden) return null;
    return <div id="chatgpt-settings" className="scroll-mt-24" data-testid="chatgpt-settings">
        <Card as="section" className="space-y-4">
            <h3 className="text-lg font-medium text-slate-900">{t('chatgpt.admin.title')}</h3>
            <p className="text-sm text-slate-600">{t('chatgpt.admin.description')}</p>
            {error && <Callout variant="danger"><p>{t(error)}</p><Button type="button" variant="secondary" disabled={busy} onClick={() => void retry()}>{t('chatgpt.retry')}</Button></Callout>}
            {!settings && !error && <p role="status">{t('chatgpt.loading')}</p>}
            {settings && <>
                <p role="status" className="text-sm font-semibold">{t(settings.enabled ? 'chatgpt.admin.enabled' : 'chatgpt.admin.disabled')}</p>
                {settings.reason !== 'keyMissing' && <p className="text-sm text-slate-600">{t(settings.ready ? 'chatgpt.admin.protected' : settings.key_source === 'managed' ? 'chatgpt.admin.automatic' : 'chatgpt.errors.notConfigured')}</p>}
                {(settings.reason === 'keyMissing' || (settings.enabled && !settings.ready)) && <Callout variant="warning">{t(`chatgpt.errors.${settings.reason || 'notConfigured'}`)}</Callout>}
                <Button type="button" variant={settings.enabled ? 'secondary' : 'primary'} disabled={busy} onClick={() => void update()}>{t(busy ? 'chatgpt.admin.saving' : settings.enabled ? 'chatgpt.admin.disable' : 'chatgpt.admin.enable')}</Button>
                {saved && <p role="status" className="text-sm text-indigo-800">{t('chatgpt.admin.saved')}</p>}
                {settings.enabled && settings.ready && <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-indigo-700 underline" href="/profilo/chatgpt">{t('chatgpt.admin.personal')}</Link>}
            </>}
            <p className="text-sm text-slate-600">{t('chatgpt.admin.disableHelp')}</p>
            <p className="text-xs text-slate-600">{t('chatgpt.admin.backup')}</p>
            <p className="text-xs text-slate-600">{t('chatgpt.admin.eligibility')}</p>
        </Card>
    </div>;
}
