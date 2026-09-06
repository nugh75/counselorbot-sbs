'use client';

import { useI18n } from '@/lib/i18n-context';
import { chatLayoutLabel } from '@/lib/i18n-chat-layout';
import type { ResumeEntries } from '@/lib/use-resume-entries';

export function ResumeLoadError({ entries }: { entries: ResumeEntries }) {
    const { lang } = useI18n();
    if (!entries.error) return null;
    return (
        <div className="px-3 py-2 text-sm text-slate-600">
            <p role="status">{chatLayoutLabel(lang, 'resumeError')}</p>
            <button type="button" disabled={entries.loading} onClick={entries.retry} className="min-h-[44px] font-semibold text-indigo-700 underline disabled:opacity-50">
                {chatLayoutLabel(lang, 'retry')}
            </button>
        </div>
    );
}
