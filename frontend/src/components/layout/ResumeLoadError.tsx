'use client';

import { useI18n } from '@/lib/i18n-context';
import { chatLayoutLabel } from '@/lib/i18n-chat-layout';
import type { ResumeEntries } from '@/lib/use-resume-entries';

export function ResumeLoadError({ entries }: { entries: ResumeEntries }) {
    const { lang } = useI18n();
    if (!entries.error) return null;
    return (
        <div className="px-4 py-2 text-sm text-ink-muted">
            <p role="status">{chatLayoutLabel(lang, 'resumeError')}</p>
            <button type="button" disabled={entries.loading} onClick={entries.retry} className="min-h-control font-semibold text-link underline disabled:opacity-50">
                {chatLayoutLabel(lang, 'retry')}
            </button>
        </div>
    );
}
