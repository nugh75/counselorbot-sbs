'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { fetchCounselors, getDisplayedCounselorId, subscribeToCounselor, type PublicCounselor } from '@/lib/counselor';
import { useI18n } from '@/lib/i18n-context';
import { counselorHelp } from '@/lib/i18n-counselor-help';
import { tavoloLabel } from '@/lib/i18n-tavolo';
import { fetchTavoloCapabilities, type TavoloCapabilities } from '@/lib/tavolo';

export function TavoloCounselor({ initialId, busy, onChange }: {
    initialId?: number;
    busy: boolean;
    onChange: (id: number | undefined, available: boolean) => void;
}) {
    const { lang, t } = useI18n();
    const accountId = useSyncExternalStore(subscribeToCounselor, getDisplayedCounselorId, () => null);
    const [picked, setPicked] = useState<number | undefined>();
    const id = picked ?? initialId ?? accountId ?? undefined;
    const [counselors, setCounselors] = useState<PublicCounselor[]>([]);
    const [capabilityResult, setCapabilities] = useState<{ id?: number; value: TavoloCapabilities } | null>(null);
    const [loaded, setLoaded] = useState(false);
    const label = (key: Parameters<typeof tavoloLabel>[0]) => tavoloLabel(key, lang);

    useEffect(() => {
        let alive = true;
        fetchCounselors(lang, lang).then((items) => {
            if (alive) { setCounselors(items); setLoaded(true); }
        });
        return () => { alive = false; };
    }, [lang]);

    useEffect(() => {
        let alive = true;
        onChange(id, false);
        if (!loaded) return;
        if (!id || !counselors.some((item) => item.id === id && item.is_active !== false)) return;
        fetchTavoloCapabilities(id).then((next) => {
            if (alive) { setCapabilities({ id, value: next }); onChange(id, next.available); }
        }).catch(() => {
            if (alive) setCapabilities({ id, value: { available: false, fallback_origin: null } });
        });
        return () => { alive = false; };
    }, [id, loaded, counselors, onChange]);

    const capabilities = capabilityResult?.id === id ? capabilityResult?.value : null;
    const selected = counselors.find((item) => item.id === id);
    return (
        <div className="space-y-1 text-xs text-ink-muted">
            <div className="flex flex-wrap items-center gap-2">
                {label('counselor')}
                <select aria-label={label('counselor')} value={id ?? ''} disabled={busy || !loaded}
                    onChange={(event) => setPicked(Number(event.target.value) || undefined)}
                    className="min-h-control max-w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink">
                    <option value="" disabled>{label('chooseCounselor')}</option>
                    {counselors.map((item) => <option key={item.id} value={item.id}>
                        {item.name} · {t(item.model_origin === 'local' ? 'counselor.origin.local' : 'counselor.origin.external')}
                    </option>)}
                </select>
                <Link href="/guide#guide-section-4" className="font-normal text-link underline">{label('guideLink')}</Link>
            </div>
            {selected?.model_origin && <p>{counselorHelp(lang)[selected.model_origin]}</p>}
            <p>{label('aiHint')}</p>
            {capabilities?.fallback_origin && <p>{label(capabilities.fallback_origin === 'local' ? 'fallbackLocal' : 'fallbackExternal')}</p>}
            {capabilities && !capabilities.available && <p role="status" className="text-warning-ink">{label('aiUnavailable')}</p>}
        </div>
    );
}
