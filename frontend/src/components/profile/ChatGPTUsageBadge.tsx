'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { chatgptRequest, type ChatGPTStatus } from '@/lib/chatgpt';
import { getIdentity } from '@/lib/auth';
import { canUseTeacherAssistant } from '@/lib/roles';
import { useI18n } from '@/lib/i18n-context';

export function ChatGPTUsageBadge({ onSubscription }: { onSubscription?: (active: boolean) => void } = {}) {
    const { t } = useI18n();
    const [area, setArea] = useState('profilo');
    const [status, setStatus] = useState<ChatGPTStatus>();
    useEffect(() => {
        const controller = new AbortController();
        void getIdentity().then(identity => { if (!controller.signal.aborted) setArea(canUseTeacherAssistant(identity) ? 'docente' : 'profilo'); });
        const load = () => { void chatgptRequest<ChatGPTStatus>('', 'GET', undefined, controller.signal).then(next => { setStatus(next); onSubscription?.(next.enabled && next.use_subscription); }).catch(() => {}); };
        load();
        window.addEventListener('chatgpt-connection-changed', load);
        window.addEventListener('focus', load);
        return () => { controller.abort(); window.removeEventListener('chatgpt-connection-changed', load); window.removeEventListener('focus', load); };
    }, [onSubscription]);
    if (!status?.enabled || !status.use_subscription) return null;
    return <Link href={`/${area}/chatgpt`} className="block break-words rounded-lg border border-indigo-200 p-3 text-xs text-indigo-800">{t('chatgpt.active')} · {status.model}{status.needs_reconnect ? ` · ${t('chatgpt.errors.reconnect')}` : ''}</Link>;
}
