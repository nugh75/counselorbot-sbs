'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, Languages } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';

type Lang = 'it' | 'en' | 'es' | 'sv';
const LANGS: Lang[] = ['it', 'en', 'es', 'sv'];

interface Instrument { code: string; name_it: string | null; }
interface Factor { id: number; instrument_code: string; code: string; label_it: string | null; }

interface CertifiedStrategy {
    id: number;
    slug: string;
    name_it: string | null; name_en: string | null; name_es: string | null; name_sv: string | null;
    recommended_when_it: string | null; recommended_when_en: string | null; recommended_when_es: string | null; recommended_when_sv: string | null;
    description_it: string | null; description_en: string | null; description_es: string | null; description_sv: string | null;
    factor_codes: string[] | null;
    match_mode: string;
    questionnaire_types: string[] | null;
    keywords: string | null;
    status: string;
    certified_by: string | null;
    source_reference: string | null;
    sort_order: number;
    is_active: boolean;
}

type FormState = {
    slug: string;
    name_it: string; name_en: string; name_es: string; name_sv: string;
    recommended_when_it: string; recommended_when_en: string; recommended_when_es: string; recommended_when_sv: string;
    description_it: string; description_en: string; description_es: string; description_sv: string;
    factor_codes: string[];
    match_mode: string;
    keywords: string;
    status: string;
    certified_by: string;
    source_reference: string;
    sort_order: string;
    is_active: boolean;
};

const EMPTY: FormState = {
    slug: '',
    name_it: '', name_en: '', name_es: '', name_sv: '',
    recommended_when_it: '', recommended_when_en: '', recommended_when_es: '', recommended_when_sv: '',
    description_it: '', description_en: '', description_es: '', description_sv: '',
    factor_codes: [], match_mode: 'any', keywords: '', status: 'draft',
    certified_by: '', source_reference: '', sort_order: '0', is_active: true,
};

export function CertifiedStrategiesPanel() {
    const { t } = useI18n();
    const [strategies, setStrategies] = useState<CertifiedStrategy[]>([]);
    const [factorsByInstrument, setFactorsByInstrument] = useState<Record<string, Factor[]>>({});
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<number | 'new' | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [lang, setLang] = useState<Lang>('it');
    const [saving, setSaving] = useState(false);
    const [translating, setTranslating] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const sr = await fetch('/api/admin/certified-strategies');
            if (sr.status === 401 || sr.status === 403) { window.location.href = '/'; return; }
            if (sr.ok) setStrategies(await sr.json());
        } catch (e) {
            console.error('Failed to load certified strategies', e);
        } finally {
            setLoading(false);
        }
    }, []);

    const loadFactors = useCallback(async () => {
        try {
            const ir = await fetch('/api/admin/instruments');
            if (!ir.ok) return;
            const instruments: Instrument[] = await ir.json();
            const entries = await Promise.all(instruments.map(async (inst) => {
                const fr = await fetch(`/api/admin/instruments/${inst.code}/factors`);
                const factors: Factor[] = fr.ok ? await fr.json() : [];
                return [inst.code, factors] as const;
            }));
            setFactorsByInstrument(Object.fromEntries(entries.filter(([, f]) => f.length > 0)));
        } catch (e) {
            console.error('Failed to load factors', e);
        }
    }, []);

    useEffect(() => { void refresh(); void loadFactors(); }, [refresh, loadFactors]);

    // Scope questionario derivato dai fattori selezionati (istrumento del fattore).
    const derivedQTypes = useMemo(() => {
        const out = new Set<string>();
        for (const [code, factors] of Object.entries(factorsByInstrument)) {
            if (factors.some((f) => form.factor_codes.includes(f.code))) out.add(code);
        }
        return [...out];
    }, [factorsByInstrument, form.factor_codes]);

    const startNew = () => { setForm(EMPTY); setLang('it'); setEditingId('new'); };
    const startEdit = (s: CertifiedStrategy) => {
        setForm({
            slug: s.slug,
            name_it: s.name_it || '', name_en: s.name_en || '', name_es: s.name_es || '', name_sv: s.name_sv || '',
            recommended_when_it: s.recommended_when_it || '', recommended_when_en: s.recommended_when_en || '', recommended_when_es: s.recommended_when_es || '', recommended_when_sv: s.recommended_when_sv || '',
            description_it: s.description_it || '', description_en: s.description_en || '', description_es: s.description_es || '', description_sv: s.description_sv || '',
            factor_codes: s.factor_codes || [], match_mode: s.match_mode || 'any',
            keywords: s.keywords || '', status: s.status || 'draft',
            certified_by: s.certified_by || '', source_reference: s.source_reference || '',
            sort_order: String(s.sort_order ?? 0), is_active: s.is_active,
        });
        setLang('it');
        setEditingId(s.id);
    };
    const cancel = () => { setEditingId(null); setForm(EMPTY); };

    const toggleFactor = (code: string) => setForm((f) => ({
        ...f,
        factor_codes: f.factor_codes.includes(code) ? f.factor_codes.filter((x) => x !== code) : [...f.factor_codes, code],
    }));

    const buildBody = () => ({
        slug: form.slug.trim(),
        name_it: form.name_it.trim() || null, name_en: form.name_en.trim() || null, name_es: form.name_es.trim() || null, name_sv: form.name_sv.trim() || null,
        recommended_when_it: form.recommended_when_it.trim() || null, recommended_when_en: form.recommended_when_en.trim() || null, recommended_when_es: form.recommended_when_es.trim() || null, recommended_when_sv: form.recommended_when_sv.trim() || null,
        description_it: form.description_it.trim() || null, description_en: form.description_en.trim() || null, description_es: form.description_es.trim() || null, description_sv: form.description_sv.trim() || null,
        factor_codes: form.factor_codes,
        match_mode: form.match_mode,
        questionnaire_types: derivedQTypes,
        keywords: form.keywords.trim() || null,
        status: form.status,
        certified_by: form.certified_by.trim() || null,
        source_reference: form.source_reference.trim() || null,
        sort_order: Number(form.sort_order) || 0,
        is_active: form.is_active,
    });

    const save = async () => {
        if (!form.slug.trim()) return;
        setSaving(true);
        try {
            const url = editingId === 'new' ? '/api/admin/certified-strategies' : `/api/admin/certified-strategies/${editingId}`;
            const method = editingId === 'new' ? 'POST' : 'PUT';
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildBody()) });
            if (!res.ok) throw new Error('save failed');
            cancel();
            await refresh();
        } catch (e) {
            console.error('Failed to save strategy', e);
        } finally {
            setSaving(false);
        }
    };

    // Traduci con Ollama: salva prima (per avere un id), poi chiama /translate e ricarica nel form.
    const translate = async () => {
        if (!form.slug.trim() || !form.name_it.trim()) return;
        setTranslating(true);
        try {
            const isNew = editingId === 'new';
            const saveUrl = isNew ? '/api/admin/certified-strategies' : `/api/admin/certified-strategies/${editingId}`;
            const saveRes = await fetch(saveUrl, { method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildBody()) });
            if (!saveRes.ok) throw new Error('save before translate failed');
            const saved: CertifiedStrategy = await saveRes.json();
            const tr = await fetch(`/api/admin/certified-strategies/${saved.id}/translate`, { method: 'POST' });
            if (!tr.ok) throw new Error('translate failed');
            startEdit(await tr.json());
            await refresh();
        } catch (e) {
            console.error('Failed to translate strategy', e);
        } finally {
            setTranslating(false);
        }
    };

    const remove = async (id: number) => {
        if (!window.confirm(t('admin.certified.confirmDelete'))) return;
        try {
            const res = await fetch(`/api/admin/certified-strategies/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('delete failed');
            await refresh();
        } catch (e) {
            console.error('Failed to delete strategy', e);
        }
    };

    const inputCls = 'h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-sky-400';
    const areaCls = 'min-h-[70px] w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 outline-none focus:border-sky-400';
    const fkey = <K extends string>(base: K) => `${base}_${lang}` as keyof FormState;

    const renderForm = () => (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="flex flex-col text-xs font-medium text-slate-500">{t('admin.certified.slug')}
                    <input className={inputCls} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="focus-c6" />
                </label>
                <label className="flex flex-col text-xs font-medium text-slate-500">{t('admin.certified.status')}
                    <select className={inputCls} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                        <option value="draft">{t('admin.certified.draft')}</option>
                        <option value="certified">{t('admin.certified.certified')}</option>
                    </select>
                </label>
                <label className="flex flex-col text-xs font-medium text-slate-500">{t('admin.certified.matchMode')}
                    <select className={inputCls} value={form.match_mode} onChange={(e) => setForm({ ...form, match_mode: e.target.value })}>
                        <option value="any">{t('admin.certified.matchAny')}</option>
                        <option value="all">{t('admin.certified.matchAll')}</option>
                    </select>
                </label>
                <label className="flex flex-col text-xs font-medium text-slate-500">{t('admin.certified.order')}
                    <input className={inputCls} type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
                </label>
            </div>

            {/* Testi multilingua con selettore lingua + traduzione Ollama */}
            <div className="mt-4 flex items-center justify-between">
                <div className="flex gap-1">
                    {LANGS.map((l) => (
                        <button key={l} type="button" onClick={() => setLang(l)} className={`rounded-md border px-2 py-1 text-xs font-medium uppercase ${lang === l ? 'border-indigo-300 bg-indigo-100 text-indigo-700' : 'border-slate-200 bg-white text-slate-500'}`}>{l}</button>
                    ))}
                </div>
                <button type="button" disabled={translating || !form.name_it.trim() || !form.slug.trim()} onClick={() => void translate()} className="inline-flex h-8 items-center gap-2 rounded-md border border-indigo-200 bg-white px-3 text-xs font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
                    <Languages className="h-4 w-4" />{t('admin.certified.translate')}
                </button>
            </div>
            <div className="mt-2 space-y-3">
                <label className="flex flex-col text-xs font-medium text-slate-500">{t('admin.certified.name')}
                    <input className={inputCls} value={form[fkey('name')] as string} onChange={(e) => setForm({ ...form, [fkey('name')]: e.target.value })} />
                </label>
                <label className="flex flex-col text-xs font-medium text-slate-500">{t('admin.certified.recommendedWhen')}
                    <textarea className={areaCls} value={form[fkey('recommended_when')] as string} onChange={(e) => setForm({ ...form, [fkey('recommended_when')]: e.target.value })} />
                </label>
                <label className="flex flex-col text-xs font-medium text-slate-500">{t('admin.certified.howTo')}
                    <textarea className={areaCls} value={form[fkey('description')] as string} onChange={(e) => setForm({ ...form, [fkey('description')]: e.target.value })} />
                </label>
            </div>

            {/* Fattori collegati, raggruppati per strumento */}
            <div className="mt-4">
                <div className="mb-1 text-xs font-medium text-slate-500">{t('admin.certified.factors')}
                    {derivedQTypes.length > 0 && <span className="ml-2 font-normal text-slate-400">→ {derivedQTypes.join(', ')}</span>}
                </div>
                <div className="space-y-2">
                    {Object.entries(factorsByInstrument).map(([code, factors]) => (
                        <div key={code} className="rounded-md border border-slate-200 bg-white p-2">
                            <div className="mb-1 text-xs font-semibold text-slate-600">{code}</div>
                            <div className="flex flex-wrap gap-1.5">
                                {factors.map((f) => (
                                    <button key={f.id} type="button" onClick={() => toggleFactor(f.code)} title={f.label_it || ''} className={`rounded-md border px-2 py-1 text-xs font-medium ${form.factor_codes.includes(f.code) ? 'border-indigo-300 bg-indigo-100 text-indigo-700' : 'border-slate-200 bg-white text-slate-500'}`}>{f.code}</button>
                                ))}
                            </div>
                        </div>
                    ))}
                    {Object.keys(factorsByInstrument).length === 0 && <p className="text-xs text-slate-400">{t('admin.certified.noFactors')}</p>}
                </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="flex flex-col text-xs font-medium text-slate-500">{t('admin.certified.keywords')}
                    <input className={inputCls} value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="concentrazione distrazione" />
                </label>
                <label className="flex flex-col text-xs font-medium text-slate-500">{t('admin.certified.certifiedBy')}
                    <input className={inputCls} value={form.certified_by} onChange={(e) => setForm({ ...form, certified_by: e.target.value })} />
                </label>
                <label className="flex flex-col text-xs font-medium text-slate-500">{t('admin.certified.source')}
                    <input className={inputCls} value={form.source_reference} onChange={(e) => setForm({ ...form, source_reference: e.target.value })} />
                </label>
            </div>

            <div className="mt-4 flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                    {t('admin.certified.active')}
                </label>
                <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                    <Check className="h-4 w-4" />{t('admin.certified.save')}
                </button>
                <button type="button" onClick={cancel} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50">
                    <X className="h-4 w-4" />{t('admin.certified.cancel')}
                </button>
            </div>
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
                <div>
                    <h2 className="text-lg font-bold text-slate-900">{t('admin.certified.title')}</h2>
                    <p className="text-sm text-slate-500">{t('admin.certified.subtitle')}</p>
                </div>
                {editingId === null && (
                    <button type="button" onClick={startNew} className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700">
                        <Plus className="h-4 w-4" />{t('admin.certified.add')}
                    </button>
                )}
            </div>

            {editingId === 'new' && renderForm()}

            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                        <tr>
                            <th className="px-3 py-2 font-semibold">{t('admin.certified.name')}</th>
                            <th className="px-3 py-2 font-semibold">{t('admin.certified.factors')}</th>
                            <th className="px-3 py-2 font-semibold">{t('admin.certified.status')}</th>
                            <th className="px-3 py-2 font-semibold">{t('admin.certified.active')}</th>
                            <th className="px-3 py-2 text-right font-semibold">{t('admin.certified.actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">…</td></tr>}
                        {!loading && strategies.length === 0 && editingId !== 'new' && (
                            <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">{t('admin.certified.empty')}</td></tr>
                        )}
                        {strategies.map((s) => (
                            editingId === s.id ? (
                                <tr key={s.id}><td colSpan={5} className="px-3 py-3">{renderForm()}</td></tr>
                            ) : (
                                <tr key={s.id}>
                                    <td className="px-3 py-2 font-medium text-slate-800">
                                        {s.name_it || s.slug}
                                        <span className="ml-2 font-mono text-xs text-slate-400">{s.slug}</span>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-slate-500">
                                        {(s.factor_codes || []).join(s.match_mode === 'all' ? ' + ' : ', ') || '-'}
                                    </td>
                                    <td className="px-3 py-2">
                                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${s.status === 'certified' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                            {s.status === 'certified' ? t('admin.certified.certified') : t('admin.certified.draft')}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2">{s.is_active ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-slate-300" />}</td>
                                    <td className="px-3 py-2">
                                        <div className="flex justify-end gap-1">
                                            <button type="button" onClick={() => startEdit(s)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Pencil className="h-4 w-4" /></button>
                                            <button type="button" onClick={() => void remove(s.id)} className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            )
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
