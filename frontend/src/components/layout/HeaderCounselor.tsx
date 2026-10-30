'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useCounselorNavigation } from './CounselorNavigation';
import { User } from 'lucide-react';
import { fetchCounselors, getDisplayedCounselorId, subscribeToCounselor, type PublicCounselor } from '@/lib/counselor';
import { useI18n } from '@/lib/i18n-context';

export function HeaderCounselor({ inline = false, onNavigate }: { inline?: boolean; onNavigate?: () => void }) {
    const { t, lang } = useI18n();
    const openCounselor = useCounselorNavigation();
    const selectedId = useSyncExternalStore(subscribeToCounselor, getDisplayedCounselorId, () => null);
    const [counselors, setCounselors] = useState<PublicCounselor[]>([]);
    useEffect(() => {
        let active = true;
        void fetchCounselors(lang, lang).then(rows => { if (active) setCounselors(rows); });
        return () => { active = false; };
    }, [lang]);
    const selected = counselors.find(row => row.id === selectedId);
    return <Link href="/counselor" onClick={event => {
        if (openCounselor && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
            event.preventDefault();
            openCounselor();
        }
        onNavigate?.();
    }} className={`inline-flex max-w-full items-center gap-2 rounded-control px-4 text-sm text-link hover:bg-brand-soft ${inline ? 'min-h-control w-full' : 'min-h-control'}`}
        aria-label={t('setup.counselor')} title={t('setup.counselor')}>
        <User className="h-4 w-4 shrink-0" />
        {/* Nella barra da `lg` il nome cede spazio alle voci di navigazione. */}
        <span className={`truncate ${inline ? '' : 'max-w-20 xl:max-w-32'}`}>{selected?.name ?? t('base.counselor.title')}</span>
    </Link>;
}
