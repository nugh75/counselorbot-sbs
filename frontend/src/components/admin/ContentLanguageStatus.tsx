'use client';

import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';

interface ContentVersion {
    id: number;
    locale: string;
    status: string;
    source: string | null;
    approved_by: string | null;
}

export function ContentLanguageStatus({
    contentType,
    contentKey,
    locale,
}: {
    contentType: 'certified_strategy' | 'certified_reading';
    contentKey: string;
    locale: string;
}) {
    const { t } = useI18n();
    const [version, setVersion] = useState<ContentVersion | null>(null);
    const [ladder, setLadder] = useState<string[]>([]);
    const [error, setError] = useState('');

    const fetchStatus = useCallback(async () => {
        if (!contentKey) return null;
        const [versionsResponse, laddersResponse] = await Promise.all([
            fetch(`/api/admin/content-versions?content_type=${contentType}&content_key=${encodeURIComponent(contentKey)}&locale=${locale}`),
            fetch('/api/admin/content-versions/ladders'),
        ]);
        const rows: ContentVersion[] = versionsResponse.ok ? await versionsResponse.json() : [];
        const ladders: Record<string, string[]> = laddersResponse.ok ? await laddersResponse.json() : {};
        return { version: rows[0] ?? null, ladder: ladders[contentType] ?? [] };
    }, [contentKey, contentType, locale]);

    useEffect(() => {
        let active = true;
        void fetchStatus().then((data) => {
            if (!active || !data) return;
            setVersion(data.version);
            setLadder(data.ladder);
        });
        return () => { active = false; };
    }, [fetchStatus]);

    const changeStatus = async (targetStatus: string) => {
        if (!version) return;
        setError('');
        const response = await fetch(`/api/admin/content-versions/${version.id}/promote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_status: targetStatus }),
        });
        if (!response.ok) {
            const body = await response.json().catch(() => null);
            setError(typeof body?.detail === 'string' ? body.detail : t('admin.q.versionPromoteFailed'));
            return;
        }
        const data = await fetchStatus();
        if (data) {
            setVersion(data.version);
            setLadder(data.ladder);
        }
    };

    if (!contentKey) return null;

    return (
        <div className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-500">{t('admin.q.versionStatus')} ({locale}):</span>
                <span className="rounded border border-slate-200 px-2 py-0.5 font-semibold text-slate-800">
                    {version?.status ?? '—'}
                </span>
                {version?.source && <span className="text-xs text-slate-500">{t('admin.q.versionSource')}: {version.source}</span>}
                {version?.approved_by && <span className="text-xs text-slate-500">{t('admin.q.versionApprovedBy')}: {version.approved_by}</span>}
            </div>
            {version && (
                <div className="flex flex-wrap gap-1.5">
                    {ladder.filter((status) => status !== version.status).map((status) => (
                        <button key={status} type="button" onClick={() => void changeStatus(status)}
                            className="rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50">
                            → {status}
                        </button>
                    ))}
                </div>
            )}
            {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
    );
}
