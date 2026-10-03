'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { chatgptRequest, type ChatGPTStatus } from '@/lib/chatgpt';
import { useI18n } from '@/lib/i18n-context';

export function ChatGPTUsageBadge({ onSubscription }: { onSubscription?: (active: boolean) => void } = {}) {
    const { t } = useI18n();
    const [status, setStatus] = useState<ChatGPTStatus>();
    useEffect(() => {
        const controller = new AbortController();
        const load = () => { void chatgptRequest<ChatGPTStatus>('', 'GET', undefined, controller.signal).then(next => { setStatus(next); onSubscription?.(next.use_subscription); }).catch(() => {}); };
        load();
        window.addEventListener('chatgpt-connection-changed', load);
        window.addEventListener('focus', load);
        return () => { controller.abort(); window.removeEventListener('chatgpt-connection-changed', load); window.removeEventListener('focus', load); };
    }, [onSubscription]);
    if (!status?.use_subscription) return null;
    return <Link href="/profilo#chatgpt" className="block break-words rounded-lg border border-indigo-200 p-3 text-xs text-indigo-800">{t('chatgpt.active')} · {status.model}{status.needs_reconnect ? ` · ${t('chatgpt.errors.reconnect')}` : ''}</Link>;
}
