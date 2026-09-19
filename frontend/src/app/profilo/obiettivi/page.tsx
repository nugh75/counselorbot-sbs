'use client';
import Link from 'next/link';
import { GoalsPanel } from '@/components/goals/GoalsPanel';
import { useI18n } from '@/lib/i18n-context';
import { goalText } from '@/lib/i18n-goals';
export default function GoalsPage() {
    const { lang, t } = useI18n();
    return <main className="page-wide space-y-5 px-4 py-8"><Link className="text-indigo-700 underline" href="/profilo">← {t('profile.nav')}</Link><h1 className="text-2xl font-bold">{goalText(lang, 'goals')}</h1><p className="text-slate-600">{goalText(lang, 'intro')}</p><GoalsPanel /></main>;
}
