'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { notifyChatGPTChange } from '@/lib/chatgpt';
import type { ClassCounselor } from '@/lib/class-settings';
import { classSettingsText, classSettingsTexts } from '@/lib/i18n-class-settings';
import { formatCategoryLabel } from '@/lib/i18n-counselor-identity';
import { useI18n } from '@/lib/i18n-context';
import { personalAPIText } from '@/lib/i18n-personal-api';
import { encode, fromServer, levelsFor, routingWith, sourceLabel, type PersonalSources } from '@/lib/personal-sources';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { SourceOptions } from '@/components/profile/SourceOptions';

const field = 'mt-1 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900';

async function request(path: string, method = 'GET', body?: unknown) {
    const response = await apiFetch(path, {
        method, cache: 'no-store', headers: { 'X-Requested-With': 'CounselorBot', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error('error');
    return response.json();
}

// #205: what a class counselor is, which model answers, and the teacher's own source for it.
export function CounselorDetailsDialog({ counselor, onClose }: { counselor: ClassCounselor; onClose: () => void }) {
    const { lang } = useI18n();
    const l = (key: keyof typeof classSettingsTexts) => classSettingsText(lang, key);
    const p = (key: Parameters<typeof personalAPIText>[1]) => personalAPIText(lang, key);
    const dialog = useRef<HTMLDialogElement>(null);
    const [sources, setSources] = useState<PersonalSources | null>(null);
    const [source, setSource] = useState('');
    const [reasoning, setReasoning] = useState('');
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<'saved' | 'error' | null>(null);
    useEffect(() => { const node = dialog.current; if (node && !node.open) node.showModal(); }, []);
    const accept = useCallback((data: PersonalSources) => {
        setSources(data);
        const bound = fromServer(data.bindings).find(b => b.counselor_id === counselor.id);
        setSource(bound?.source ?? ''); setReasoning(bound?.reasoning ?? '');
    }, [counselor.id]);
    useEffect(() => {
        let active = true;
        void request('/api/user/api-connections').then((data: PersonalSources) => { if (active) accept(data); }).catch(() => {});
        return () => { active = false; };
    }, [accept]);

    const description = counselor.description_i18n?.[lang] || counselor.description;
    const model = counselor.model ? `${counselor.model.name} · ${counselor.model.provider} · ${counselor.model.model}` : l('counselorInstallationDefault');
    // What answers now: this counselor's choice, else the default, else the institution.
    const saved = sources && fromServer(sources.bindings).find(b => b.counselor_id === counselor.id);
    const effective = !sources?.enabled ? '' : saved?.source || encode(sources.default_connection_id, sources.default_chatgpt_model);
    const answers = sources && effective ? sourceLabel(sources, effective) : model;
    const dirty = !!sources && (source !== (saved?.source ?? '') || reasoning !== (saved?.reasoning ?? ''));
    const save = () => {
        if (!sources || busy) return;
        setBusy(true); setStatus(null);
        void request('/api/user/api-routing', 'PUT', routingWith(sources, counselor.id, source, reasoning))
            .then((data: PersonalSources) => { accept(data); setStatus('saved'); notifyChatGPTChange(); })
            .catch(() => setStatus('error'))
            .finally(() => setBusy(false));
    };

    return <dialog ref={dialog} aria-labelledby="counselor-details-title" data-testid="counselor-details"
        onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === dialog.current) onClose(); }}
        className="m-0 h-dvh max-h-none w-full max-w-none bg-white p-0 text-slate-900 backdrop:bg-slate-900/50 sm:m-auto sm:h-auto sm:max-h-[90vh] sm:max-w-xl sm:rounded-xl">
        <div className="flex h-full max-h-[inherit] flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4 sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {counselor.avatar_url && <img src={counselor.avatar_url} alt="" className="h-10 w-16 shrink-0 rounded object-cover" />}
                    <div className="min-w-0">
                        <h2 id="counselor-details-title" className="break-words text-xl font-bold">{counselor.name}</h2>
                        {counselor.approach_categories.length > 0 && <p className="text-xs text-slate-500">{counselor.approach_categories.map(item => formatCategoryLabel(item, lang)).join(' · ')}</p>}
                    </div>
                </div>
                <Button type="button" variant="ghost" aria-label={l('counselorClose')} onClick={onClose}><X className="h-5 w-5" aria-hidden /></Button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:px-6">
                <p className="whitespace-pre-wrap text-sm text-slate-700">{description || l('counselorNoDescription')}</p>
                <dl className="space-y-2 text-sm">
                    <div><dt className="font-semibold text-slate-800">{l('counselorInstitutionModel')}</dt><dd className="break-words text-slate-600" data-testid="counselor-institution-model">{model}</dd></div>
                    {sources?.available && <div><dt className="font-semibold text-slate-800">{l('counselorAnswersForYou')}</dt><dd className="break-words text-slate-600" data-testid="counselor-answers">{answers}</dd></div>}
                </dl>
                {sources?.available && <fieldset disabled={busy} className="space-y-3 rounded-lg border border-slate-200 p-3">
                    <legend className="px-1 text-sm font-semibold text-slate-800">{l('counselorYourSource')}</legend>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="min-w-0 flex-1">
                            <label htmlFor="counselor-details-source" className="text-sm font-semibold text-slate-800">{p('defaultConnection')}</label>
                            <select id="counselor-details-source" className={field} value={source} onChange={e => { setSource(e.target.value); if (!levelsFor(sources, e.target.value).includes(reasoning)) setReasoning(''); }}>
                                <option value="">{p('useDefault')}</option><SourceOptions sources={sources} />
                            </select>
                        </div>
                        {source && <div className="sm:w-48">
                            <label htmlFor="counselor-details-reasoning" className="text-sm font-semibold text-slate-800">{p('reasoning')}</label>
                            <select id="counselor-details-reasoning" className={field} value={reasoning} onChange={e => setReasoning(e.target.value)}>
                                <option value="">{p('reasoningDefault')}</option>
                                {levelsFor(sources, source).map(level => <option key={level} value={level}>{p(`reasoning_${level}` as Parameters<typeof personalAPIText>[1])}</option>)}
                            </select>
                        </div>}
                    </div>
                    <p className="text-sm text-slate-600">{l('counselorPersonalOnly')}</p>
                    <Button type="button" disabled={busy || !dirty} onClick={save}>{l('counselorSaveSource')}</Button>
                    {status === 'saved' && <p role="status" className="text-sm text-slate-700">{l('counselorSourceSaved')}</p>}
                    {status === 'error' && <Callout variant="danger">{p('error')}</Callout>}
                </fieldset>}
                {sources?.available && <Link href="/docente/api-personali" className="inline-flex min-h-11 items-center text-sm font-semibold text-indigo-700 underline">{l('counselorOpenSources')}</Link>}
            </div>
        </div>
    </dialog>;
}
