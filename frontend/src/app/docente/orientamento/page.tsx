'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, MoreHorizontal, Plus } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { categoryText, type CategoryTextKey } from '@/lib/i18n-institution-categories';
import { useCategoryDraftGuard } from '@/lib/use-category-draft-guard';
import type { Institution } from '@/lib/referrals-api';

type Category = { id: string; name: string; description: string; is_active: boolean; position: number; updated_by: string; updated_at: string };
type Snapshot = { revision: number; categories: Category[] };
type Draft = { id?: string; name: string; description: string; originalName: string; originalDescription: string };
type Action = 'create' | 'edit' | 'archive' | 'restore' | 'move_up' | 'move_down';
const control = 'min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-slate-600';
const input = `${control} w-full bg-white dark:bg-slate-900`;

function Heading() {
    const { lang } = useI18n();
    return <header className="space-y-5">
        <Link href="/docente" className="inline-flex min-h-[44px] items-center gap-2 text-sm"><ArrowLeft className="h-4 w-4" aria-hidden />{categoryText(lang, 'back')}</Link>
        <div className="flex items-center gap-4">
            <Image src="/images/platform/bussola.png" width={64} height={64} alt="" className="h-16 w-16 shrink-0 object-contain" />
            <div className="min-w-0"><h1 className="text-2xl font-bold">{categoryText(lang, 'title')}</h1><p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{categoryText(lang, 'subtitle')}</p></div>
        </div>
    </header>;
}

export default function InstitutionOrientationPage() {
    const { lang } = useI18n();
    const [institutions, setInstitutions] = useState<Institution[] | null>(null);
    const [selected, setSelected] = useState<number | null>(null);
    const [errorKey, setErrorKey] = useState<CategoryTextKey | null>(null);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        void apiFetch('/api/teacher/institutions', { signal: controller.signal }).then(async response => {
            if (!response.ok) throw new Error([401, 403].includes(response.status) ? 'denied' : 'loadError');
            const data: Institution[] = await response.json();
            if (!Array.isArray(data)) throw new Error('loadError');
            if (!controller.signal.aborted) { setInstitutions(data); setSelected(data[0]?.id ?? null); setErrorKey(null); }
        }).catch(error => { if (!controller.signal.aborted) setErrorKey(error.message === 'denied' ? 'denied' : 'loadError'); });
        return () => controller.abort();
    }, [attempt]);
    if (institutions?.length && selected !== null) return <CategoryEditor key={selected} institutions={institutions} institutionId={selected} onSelect={setSelected} />;
    return <div className="page-wide space-y-6 px-4 py-8"><Heading />
        {errorKey ? <div role="alert" className="space-y-3"><p>{categoryText(lang, errorKey)}</p><button className={control} onClick={() => { setErrorKey(null); setAttempt(value => value + 1); }}>{categoryText(lang, 'retry')}</button></div>
            : <p role="status">{categoryText(lang, institutions ? 'noInstitutions' : 'loading')}</p>}
    </div>;
}

function CategoryEditor({ institutions, institutionId, onSelect }: { institutions: Institution[]; institutionId: number; onSelect: (id: number) => void }) {
    const { lang } = useI18n();
    const l = (key: CategoryTextKey) => categoryText(lang, key);
    const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [errorKey, setErrorKey] = useState<CategoryTextKey | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [menu, setMenu] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const nameRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLHeadingElement>(null);
    const triggers = useRef(new Map<string, HTMLButtonElement>());
    const dirty = draft !== null && (draft.name !== draft.originalName || draft.description !== draft.originalDescription);
    useCategoryDraftGuard(dirty || busy, l('leave'));
    const path = `/api/teacher/institutions/${institutionId}/orientation-categories`;
    const institution = institutions.find(item => item.id === institutionId)!;
    const draftId = draft?.id ?? (draft ? 'new' : null);

    useEffect(() => {
        const controller = new AbortController();
        void apiFetch(path, { signal: controller.signal }).then(async response => {
            if (!response.ok) throw new Error([401, 403].includes(response.status) ? 'denied' : 'loadError');
            const data: Snapshot = await response.json();
            if (!Array.isArray(data.categories) || !Number.isInteger(data.revision)) throw new Error('loadError');
            if (!controller.signal.aborted) { setSnapshot(data); setErrorKey(null); }
        }).catch(error => { if (!controller.signal.aborted) setErrorKey(error.message === 'denied' ? 'denied' : 'loadError'); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [path, attempt]);
    useEffect(() => { if (draftId) nameRef.current?.focus(); }, [draftId]);
    useEffect(() => {
        if (!menu) return;
        menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
        const outside = (event: PointerEvent) => {
            if (event.target instanceof Node && !menuRef.current?.contains(event.target) && !triggers.current.get(menu)?.contains(event.target)) setMenu(null);
        };
        const escape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { setMenu(null); triggers.current.get(menu)?.focus(); }
        };
        document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
        return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
    }, [menu]);

    const mayDiscard = () => !dirty || window.confirm(l('leave'));
    const openEditor = (category?: Category) => {
        if (busy || !mayDiscard()) return;
        setMenu(null);
        setDraft({ id: category?.id, name: category?.name ?? '', description: category?.description ?? '', originalName: category?.name ?? '', originalDescription: category?.description ?? '' });
        nameRef.current?.focus();
    };
    const unavailableDraft = Boolean(draft?.id && snapshot && !snapshot.categories.some(item => item.id === draft.id && item.is_active));
    const blocked = busy || loading || !snapshot || ['conflict', 'denied', 'loadError'].includes(errorKey ?? '');
    const change = async (action: Action, categoryId?: string) => {
        if (blocked || !snapshot) return;
        setBusy(true); setMenu(null); setErrorKey(null);
        try {
            const response = await apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: snapshot.revision, action, ...(categoryId ? { category_id: categoryId } : {}), ...(['create', 'edit'].includes(action) ? { name: draft!.name.trim(), description: draft!.description.trim() } : {}) }) });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                const code = body.detail?.code;
                setErrorKey([401, 403].includes(response.status) ? 'denied' : code === 'duplicate' ? 'duplicate' : ['archived', 'missing'].includes(code) ? 'unavailable' : response.status === 409 ? 'conflict' : 'saveError');
                return;
            }
            const data: Snapshot = await response.json();
            setSnapshot(data);
            if (action === 'create' || action === 'edit') setDraft(null);
            listRef.current?.focus({ preventScroll: true });
        } catch { setErrorKey('saveError'); }
        finally { setBusy(false); }
    };
    const active = snapshot?.categories.filter(item => item.is_active) ?? [];
    const archived = snapshot?.categories.filter(item => !item.is_active) ?? [];
    const reload = () => { if (!busy) { setLoading(true); setMenu(null); setAttempt(value => value + 1); } };
    return <div className="page-wide space-y-6 px-4 py-8" data-institution-categories>
        <Heading />
        {institutions.length > 1 ? <label className="block max-w-lg text-sm">{l('institution')}<select className={`${input} mt-1`} value={institutionId} disabled={busy} onChange={event => { if (mayDiscard()) onSelect(Number(event.target.value)); }}>{institutions.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
            : <p className="font-medium">{l('institution')}: {institution.name}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 ref={listRef} tabIndex={-1} className="text-lg font-semibold">{l('categories')}</h2><button type="button" disabled={blocked} className={`${control} inline-flex items-center gap-2`} onClick={() => openEditor()}><Plus className="h-4 w-4" aria-hidden />{l('new')}</button></div>
        {errorKey && <div role="alert" className="space-y-2 rounded-lg border border-amber-300 p-3"><p>{l(errorKey)}</p><button type="button" disabled={busy || loading} className={control} onClick={reload}>{l('retry')}</button></div>}
        {draft && <form className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900" onSubmit={event => { event.preventDefault(); void change(draft.id ? 'edit' : 'create', draft.id); }}>
            <h3 className="font-semibold">{l(draft.id ? 'edit' : 'new')}</h3>
            {unavailableDraft && <p role="alert">{l('unavailable')}</p>}
            <label className="block text-sm">{l('name')} *<input ref={nameRef} className={`${input} mt-1`} maxLength={120} required disabled={busy} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></label>
            <label className="block text-sm">{l('description')}<textarea className={`${input} mt-1`} rows={3} maxLength={2000} disabled={busy} value={draft.description} onChange={event => setDraft({ ...draft, description: event.target.value })} /></label>
            <div className="flex justify-end gap-2"><button type="button" disabled={busy} className={control} onClick={() => { if (mayDiscard()) { setDraft(null); listRef.current?.focus(); } }}>{l('cancel')}</button><button type="submit" disabled={blocked || unavailableDraft || !draft.name.trim()} className={`${control} bg-cyan-800 text-white`}>{l('save')}</button></div>
        </form>}
        {loading && <p role="status">{l('loading')}</p>}
        {!loading && snapshot && active.length === 0 && <p>{l('empty')}</p>}
        <ul className="space-y-2" aria-label={l('categories')}>
            {active.map((category, index) => <li key={category.id} data-category-id={category.id} className="flex items-start gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
                <div className="min-w-0 flex-1"><h3 className="break-words font-medium">{category.name}</h3>{category.description && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-600 dark:text-slate-400">{category.description}</p>}<p className="mt-2 break-words text-xs text-slate-500">{l('changed')}: {category.updated_by} · {new Date(category.updated_at).toLocaleString(lang)}</p></div>
                <div className="relative shrink-0"><button ref={node => { if (node) triggers.current.set(category.id, node); else triggers.current.delete(category.id); }} type="button" aria-label={`${l('actions')}: ${category.name}`} aria-expanded={menu === category.id} aria-controls={`category-actions-${category.id}`} disabled={blocked} className={control} onClick={() => setMenu(menu === category.id ? null : category.id)}><MoreHorizontal className="h-4 w-4" aria-hidden /></button>
                    {menu === category.id && <div ref={menuRef} id={`category-actions-${category.id}`} className="absolute right-0 top-full z-20 mt-1 w-48 max-w-[calc(100vw-3rem)] space-y-1 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900" onBlur={event => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget) && !triggers.current.get(category.id)?.contains(event.relatedTarget)) setMenu(null); }}>
                        <button type="button" className={`${control} w-full text-left`} onClick={() => openEditor(category)}>{l('edit')}</button>
                        <button type="button" disabled={index === 0 || Boolean(draft)} className={`${control} w-full text-left`} onClick={() => void change('move_up', category.id)}>{l('up')}</button>
                        <button type="button" disabled={index === active.length - 1 || Boolean(draft)} className={`${control} w-full text-left`} onClick={() => void change('move_down', category.id)}>{l('down')}</button>
                        <button type="button" disabled={Boolean(draft)} className={`${control} w-full text-left`} onClick={() => void change('archive', category.id)}>{l('archive')}</button>
                    </div>}
                </div>
            </li>)}
        </ul>
        {archived.length > 0 && <details><summary className="cursor-pointer py-3 text-sm">{l('archived')} ({archived.length})</summary><ul className="space-y-2">{archived.map(category => <li key={category.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700"><span className="min-w-0 break-words">{category.name}</span><button type="button" disabled={blocked || Boolean(draft)} className={`${control} shrink-0`} onClick={() => void change('restore', category.id)}>{l('restore')}</button></li>)}</ul></details>}
    </div>;
}
