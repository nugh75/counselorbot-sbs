'use client';

import Link from 'next/link';
import { ArrowRight, Bot, KeyRound } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { personalAPIText } from '@/lib/i18n-personal-api';
import { usePersonalAIFeatures } from '@/lib/use-personal-ai-features';

export function PersonalAIConnections({ area }: { area: 'profilo' | 'docente' }) {
    const { lang, t } = useI18n();
    const { personalAPI: api, chatgpt } = usePersonalAIFeatures();
    if (!api && !chatgpt) return null;
    const entries = [
        { visible: api, path: 'api-personali', title: personalAPIText(lang, 'title'), description: personalAPIText(lang, 'description'), icon: KeyRound },
        { visible: chatgpt, path: 'chatgpt', title: t('chatgpt.title'), description: t('chatgpt.intro'), icon: Bot },
    ];
    return <nav className="grid gap-2 md:grid-cols-2" data-testid="personal-ai-connections">
        {entries.filter(entry => entry.visible).map(({ path, title, description, icon: Icon }) =>
            <Link key={path} href={`/${area}/${path}`} className="flex min-h-24 items-center gap-4 rounded-xl px-3 py-3 hover:bg-slate-50">
                <Icon className="h-8 w-8 shrink-0 text-indigo-600" aria-hidden />
                <span className="min-w-0 flex-1"><span className="block font-bold text-slate-900">{title}</span><span className="mt-1 block text-sm text-slate-600">{description}</span></span>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            </Link>)}
    </nav>;
}
