'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { KeyRound, ArrowRight } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { personalAPIText } from '@/lib/i18n-personal-api';

export function PersonalAPILink({ area }: { area: 'profilo' | 'docente' }) {
    const { lang } = useI18n();
    const [available, setAvailable] = useState(false);
    useEffect(() => {
        const controller = new AbortController();
        apiFetch('/api/user/api-settings', { signal: controller.signal, cache: 'no-store' })
            .then(async response => { if (response.ok) setAvailable((await response.json()).available); })
            .catch(() => {});
        return () => controller.abort();
    }, []);
    if (!available) return null;
    return <Link href={`/${area}/api-personali`} className="flex min-h-24 items-center gap-4 rounded-xl px-3 py-3 hover:bg-slate-50">
        <KeyRound className="h-8 w-8 shrink-0 text-indigo-600" aria-hidden />
        <span className="min-w-0 flex-1">
            <span className="block font-bold text-slate-900">{personalAPIText(lang, 'title')}</span>
            <span className="mt-1 block text-sm text-slate-600">{personalAPIText(lang, 'description')}</span>
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
    </Link>;
}
