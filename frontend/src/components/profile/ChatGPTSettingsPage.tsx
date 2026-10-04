'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { personalAreaText } from '@/lib/i18n-personal-area';
import { teacherAreaText } from '@/lib/i18n-teacher-area';
import { ChatGPTConnectionPanel } from './ChatGPTConnectionPanel';

export function ChatGPTSettingsPage({ area }: { area: 'profilo' | 'docente' }) {
    const { lang } = useI18n();
    return <div className="min-h-screen bg-slate-50 px-4 py-8"><div className="mx-auto max-w-2xl space-y-6">
        <Link href={`/${area}`} className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50">
            <ArrowLeft className="h-4 w-4" aria-hidden />{area === 'docente' ? teacherAreaText(lang, 'title') : personalAreaText(lang, 'title')}
        </Link>
        <div id="chatgpt"><ChatGPTConnectionPanel area={area} /></div>
    </div></div>;
}
