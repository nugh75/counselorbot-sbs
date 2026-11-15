'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { apiFetch } from '@/lib/auth';
import { inProgressActions, readWorkspaceActions, type InProgressAction } from '@/lib/active-actions';
import { activeActionsText } from '@/lib/i18n-active-actions';
import { useI18n } from '@/lib/i18n-context';
import { visualLabel } from '@/lib/i18n-visual-tools';
import { personalSlugEnabled } from '@/lib/personal-tool-access';
import { usePersonalToolAccess } from '@/lib/use-personal-tool-access';
import { EntryLink, EntrySection } from '@/components/ui/EntryList';

// #608: nella sezione «Risultati e conversazioni» compaiono anche le attività
// in corso, così si ritrovano e si riprendono dallo stesso posto. La lettura è
// separata dai risultati: un errore qui non nasconde questionari e dialoghi.
const LIMIT = 5;

export function ActiveActionsCard() {
    const { lang } = useI18n();
    const access = usePersonalToolAccess();
    const [items, setItems] = useState<InProgressAction[]>([]);
    const [failed, setFailed] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const l = (key: Parameters<typeof activeActionsText>[1]) => activeActionsText(lang, key);
    // Strumento spento dalla classe: la lettura resta possibile, ma qui non
    // serve una scorciatoia verso una pagina che non accetta lavoro nuovo.
    const enabled = personalSlugEnabled(access, 'azioni');

    useEffect(() => {
        if (!enabled) return;
        const controller = new AbortController();
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]);
        void apiFetch(`/api/user/timeline?lang=${encodeURIComponent(lang)}`, { signal })
            .then(response => {
                if (!response.ok) throw new Error(String(response.status));
                return response.json();
            })
            .then((payload: unknown) => {
                if (controller.signal.aborted) return;
                setItems(inProgressActions(readWorkspaceActions(payload)));
                setFailed(false);
                setLoaded(true);
            })
            .catch(() => {
                if (!controller.signal.aborted) setFailed(true);
            });
        return () => controller.abort();
    }, [enabled, lang, attempt]);

    if (!enabled) return null;
    if (failed) return <section aria-labelledby="active-actions-title" className="space-y-2">
        <h2 id="active-actions-title" className="border-b border-line-strong pb-2 text-lg font-semibold text-ink">{l('title')}</h2>
        <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-ink-body">
            <p>{l('error')}</p>
            <Button variant="ghost" onClick={() => { setFailed(false); setLoaded(false); setAttempt(n => n + 1); }}>{l('retry')}</Button>
        </div>
    </section>;
    if (!loaded) return <p role="status" className="text-sm text-ink-muted">{l('loading')}</p>;
    if (!items.length) return null;

    const visible = items.slice(0, LIMIT);
    return <div className="space-y-2">
        <EntrySection id="active-actions-title" title={l('title')} subtitle={l('subtitle')}>
            {visible.map(item => <EntryLink
                key={item.id} idPrefix="active" id={item.id}
                href={`/profilo/azioni#action-${encodeURIComponent(item.id)}`}
                name={item.title}
                description={[visualLabel(lang, 'doing'), item.date && new Date(`${item.date}T12:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })].filter(Boolean).join(' · ')} />)}
        </EntrySection>
        <Link href="/profilo/azioni" className="inline-flex min-h-control items-center gap-2 px-2 text-sm font-semibold text-link">
            {l('all')}<ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
    </div>;
}
