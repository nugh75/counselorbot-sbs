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

// #608: nella sezione «Risultati e conversazioni» compaiono anche le attività
// in corso, così si ritrovano e si riprendono dallo stesso posto. La lettura è
// separata dai risultati: un errore qui non nasconde questionari e dialoghi.
const LIMIT = 5;

export function ActiveActionsCard({ resume = false }: { resume?: boolean }) {
    const { lang } = useI18n();
    const access = usePersonalToolAccess();
    const [items, setItems] = useState<InProgressAction[]>([]);
    const [failed, setFailed] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const l = (key: Parameters<typeof activeActionsText>[1]) => activeActionsText(lang, key);
    const title = l(resume ? 'resumeTitle' : 'title');
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
    if (failed) return <section aria-labelledby="active-actions-title" className="glass-panel p-5 space-y-3">
        <h2 id="active-actions-title" className="text-lg font-bold text-slate-800">{title}</h2>
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-700">
            <p>{l('error')}</p>
            <Button variant="ghost" onClick={() => { setFailed(false); setLoaded(false); setAttempt(n => n + 1); }}>{l('retry')}</Button>
        </div>
    </section>;
    if (!loaded) return <p role="status" className="text-sm text-slate-600">{l('loading')}</p>;
    if (!items.length) return null;

    const visible = items.slice(0, LIMIT);
    return <section aria-labelledby="active-actions-title" className="glass-panel p-5 space-y-3">
        <div>
            <h2 id="active-actions-title" className="text-lg font-bold text-slate-800">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{l('subtitle')}</p>
        </div>
        <ul className="divide-y divide-slate-200">
            {visible.map(item => <li key={item.id}>
                <Link
                    href={`/profilo/azioni#action-${encodeURIComponent(item.id)}`}
                    aria-label={`${l('open')}: ${item.title}`}
                    className="flex min-h-11 items-center gap-3 rounded-md py-2 text-sm text-indigo-700"
                >
                    <span className="min-w-0 flex-1 break-words">
                        <span className="text-slate-600">{visualLabel(lang, 'doing')} · </span>
                        <span className="font-semibold">{item.title}</span>
                        {item.date && <time dateTime={item.date} className="ml-2 text-slate-600">{new Date(`${item.date}T12:00:00`).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' })}</time>}
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                </Link>
            </li>)}
        </ul>
        <Link href="/profilo/azioni" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-indigo-700">
            {l('all')}<ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
    </section>;
}
