'use client';

import Link from 'next/link';
import { ArrowRight, Bot, KeyRound } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { personalAPIText } from '@/lib/i18n-personal-api';
import { usePersonalAIFeatures } from '@/lib/use-personal-ai-features';

export function PersonalAIConnections({ area }: { area: 'profilo' | 'docente' }) {
    const { lang } = useI18n();
    const { personalAPI: api, chatgpt } = usePersonalAIFeatures();
    if (!api && !chatgpt) return null;
    // #200: one page for personal APIs and ChatGPT.
    const entries = [
        { visible: true, path: 'api-personali', title: personalAPIText(lang, 'sectionTitle'), description: personalAPIText(lang, 'description'), icon: api ? KeyRound : Bot },
    ];
    const headingId = `${area}-ai-connections-title`;
    return <section aria-labelledby={headingId} data-testid="personal-ai-connections">
        <h2 id={headingId} className="border-b border-slate-200 pb-2 text-lg font-bold text-slate-800">{personalAPIText(lang, 'sectionTitle')}</h2>
        <nav aria-labelledby={headingId} className="mt-2 grid gap-2 md:grid-cols-2">
            {entries.filter(entry => entry.visible).map(({ path, title, description, icon: Icon }) =>
                <Link key={path} href={`/${area}/${path}`} className="flex min-h-24 items-center gap-4 rounded-xl px-3 py-3 hover:bg-slate-50">
                    <Icon className="h-8 w-8 shrink-0 text-indigo-600" aria-hidden />
                    <span className="min-w-0 flex-1"><span className="block font-bold text-slate-900">{title}</span><span className="mt-1 block text-sm text-slate-600">{description}</span></span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                </Link>)}
        </nav>
    </section>;
}
