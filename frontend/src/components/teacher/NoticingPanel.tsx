'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { noticingText, type NoticingTextKey } from '@/lib/i18n-noticing';
import { parseNoticing, type Noticing } from '@/lib/teacher-noticing';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { useTeacherResource } from './useTeacherResource';

const KIND_STYLE = {
    revisit: 'bg-sky-100 text-sky-800',
    resource: 'bg-emerald-100 text-emerald-800',
    difficulty: 'bg-amber-100 text-amber-900',
    attention: 'bg-rose-100 text-rose-800',
} as const;

// Generated only on the teacher's request: opening the detail never calls the model.
export function NoticingPanel({ path, onQuote }: { path: string; onQuote: (message: number) => void }) {
    const { lang, t } = useI18n();
    const l = (key: NoticingTextKey) => noticingText(lang, key);
    const resource = useTeacherResource(`${path}?lang=${lang}`, parseNoticing);
    const [generated, setGenerated] = useState<Noticing | null>(null);
    const [busy, setBusy] = useState(false);
    const [failed, setFailed] = useState(false);
    const data = generated ?? resource.data;

    const generate = async () => {
        setBusy(true); setFailed(false);
        try {
            const response = await apiFetch(`${path}?lang=${lang}`, { method: 'POST' });
            if (!response.ok) throw new Error('generation failed');
            setGenerated(parseNoticing(await response.json()));
        } catch {
            setFailed(true);
        } finally {
            setBusy(false);
        }
    };

    const action = data && data.status !== 'empty' && <Button type="button" variant="secondary" onClick={() => void generate()} disabled={busy} aria-busy={busy}
        className="min-h-[44px] max-w-full whitespace-normal">
        <Sparkles className="h-4 w-4 shrink-0" aria-hidden />{l(busy ? 'generating' : data.status === 'missing' ? 'generate' : 'regenerate')}
    </Button>;

    return <section className="space-y-3 rounded-md border border-violet-200 bg-violet-50 p-3" aria-label={l('title')}>
        <h3 className="font-semibold text-slate-800">{l('title')}</h3>
        <p className="text-xs text-slate-600">{l('aiNote')}</p>
        {resource.loading && !data && <p role="status">{t('common.loading')}</p>}
        {resource.failed && !data && <Callout variant="danger"><p>{l('loadError')}</p></Callout>}
        {data && <>
            {data.status === 'empty' && <p>{l('empty')}</p>}
            {data.status === 'missing' && <p>{l('missing')}</p>}
            {data.status === 'unavailable' && <p role="alert" className="text-red-700">{l('unavailable')}</p>}
            {data.status === 'stale' && <p role="status" className="text-amber-900">{l('stale')}</p>}
            {(data.status === 'ready' || data.status === 'stale') && (data.items.length === 0
                ? <p>{l('noItems')}</p>
                : <ul className="space-y-3">{data.items.map((item, index) => <li key={index} className="space-y-2 rounded-md border border-violet-100 bg-white p-3">
                    <p className="flex flex-wrap items-start gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${KIND_STYLE[item.kind]}`}>{l(item.kind)}</span>
                        <span className="min-w-0 flex-1 break-words text-slate-800">{item.text}</span>
                    </p>
                    <div className="space-y-1">
                        <p className="text-xs font-semibold text-slate-500">{l('studentWords')}</p>
                        {item.evidence.map((ref, i) => <blockquote key={i} className="flex flex-wrap items-start justify-between gap-2 border-l-4 border-slate-300 pl-3 text-sm italic text-slate-700">
                            <span className="min-w-0 flex-1 break-words">«{ref.quote}»</span>
                            <button type="button" onClick={() => onQuote(ref.message)} className="min-h-[44px] shrink-0 px-1 text-xs font-medium not-italic text-indigo-700 underline">
                                {l('goToMessage')} {ref.message + 1}
                            </button>
                        </blockquote>)}
                    </div>
                </li>)}</ul>)}
            {data.generated_at && <p className="text-xs text-slate-600">{l('generatedAt')}{' '}<time dateTime={data.generated_at}>{new Date(data.generated_at).toLocaleString(lang)}</time></p>}
            {failed && <p role="alert" className="text-sm text-red-700">{l('unavailable')}</p>}
            {action}
        </>}
    </section>;
}
