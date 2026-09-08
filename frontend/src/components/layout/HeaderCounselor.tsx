'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { User } from 'lucide-react';
import { fetchCounselors, getDisplayedCounselorId, subscribeToCounselor, type PublicCounselor } from '@/lib/counselor';
import { useI18n } from '@/lib/i18n-context';

export function HeaderCounselor({ inline = false, onNavigate }: { inline?: boolean; onNavigate?: () => void }) {
    const { t, lang } = useI18n();
    const selectedId = useSyncExternalStore(subscribeToCounselor, getDisplayedCounselorId, () => null);
    const [counselors, setCounselors] = useState<PublicCounselor[]>([]);
    useEffect(() => {
        let active = true;
        void fetchCounselors(lang, lang).then(rows => { if (active) setCounselors(rows); });
        return () => { active = false; };
    }, [lang]);
    const selected = counselors.find(row => row.id === selectedId);
    return <Link href="/counselor" onClick={onNavigate} className={`inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-md px-3 text-sm font-medium text-indigo-700 hover:bg-indigo-50 ${inline ? 'w-full' : ''}`}
        aria-label={t('setup.counselor')} title={t('setup.counselor')}>
        <User className="h-4 w-4 shrink-0" />
        <span className="max-w-32 truncate">{selected?.name ?? t('base.counselor.title')}</span>
    </Link>;
}
