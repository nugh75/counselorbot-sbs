'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';

import { LANGUAGES } from '@/lib/i18n';

const QTYPES = ['QSA', 'QSAr', 'ZTPI', 'SAVICKAS', 'QPCS', 'QPCC', 'QAP'];

interface Preset { id: number; name: string; provider: string; model: string; }

interface Counselor {
    id: number;
    slug: string;
    name: string;
    description: string | null;
    persona: string | null;
    avatar: string | null;
    preset_id: number | null;
    questionnaire_types: string[] | null;
    language: string[];
    sort_order: number;
    is_active: boolean;
    provider: string | null;
    model: string | null;
}

type FormState = {
    slug: string; name: string; description: string; persona: string; avatar: string;
    preset_id: string;     questionnaire_types: string[]; language: string[]; sort_order: string; is_active: boolean;
};

const EMPTY: FormState = {
    slug: '', name: '', description: '', persona: '', avatar: '',
    preset_id: '', questionnaire_types: [], language: ['*'], sort_order: '0', is_active: true,
};

export function CounselorsPanel() {
    const { t } = useI18n();
    const [counselors, setCounselors] = useState<Counselor[]>([]);
    const [presets, setPresets] = useState<Preset[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<number | 'new' | null>(null);
    const [form, setForm] = useState<FormState>(EMPTY);
    const [saving, setSaving] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const [cr, pr] = await Promise.all([
                fetch('/api/admin/counselors'),
                fetch('/api/admin/presets'),
            ]);
            if (cr.status === 401 || cr.status === 403) { window.location.href = '/'; return; }
            if (cr.ok) setCounselors(await cr.json());
            if (pr.ok) setPresets(await pr.json());
        } catch (e) {
            console.error('Failed to load counselors', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    const startNew = () => { setForm(EMPTY); setEditingId('new'); };
    const startEdit = (c: Counselor) => {
        setForm({
            slug: c.slug, name: c.name, description: c.description || '', persona: c.persona || '',
            avatar: c.avatar || '', preset_id: c.preset_id != null ? String(c.preset_id) : '',
            questionnaire_types: c.questionnaire_types || [], language: Array.isArray(c.language) ? c.language : ['*'],
            sort_order: String(c.sort_order ?? 0), is_active: c.is_active,
        });
        setEditingId(c.id);
    };
    const cancel = () => { setEditingId(null); setForm(EMPTY); };

    const toggleQ = (q: string) => setForm((f) => ({
        ...f,
        questionnaire_types: f.questionnaire_types.includes(q)
            ? f.questionnaire_types.filter((x) => x !== q)
            : [...f.questionnaire_types, q],
    }));

    const toggleLang = (code: string) => setForm((f) => {
        if (code === '*') return { ...f, language: ['*'] };
        // remove '*' and toggle the specific code
        const filtered = f.language.filter((x) => x !== '*');
        const next = filtered.includes(code)
            ? filtered.filter((x) => x !== code)
            : [...filtered, code];
        return { ...f, language: next.length === 0 ? ['*'] : next };
    });

    const save = async () => {
        if (!form.slug.trim() || !form.name.trim()) return;
        setSaving(true);
        try {
            const body = {
                slug: form.slug.trim(), name: form.name.trim(),
                description: form.description.trim() || null,
                persona: form.persona.trim() || null,
                avatar: form.avatar.trim() || null,
                preset_id: form.preset_id === '' ? null : Number(form.preset_id),
                questionnaire_types: form.questionnaire_types,
                language: form.language, sort_order: Number(form.sort_order) || 0,
                is_active: form.is_active,
            };
            const url = editingId === 'new' ? '/api/admin/counselors' : `/api/admin/counselors/${editingId}`;
            const method = editingId === 'new' ? 'POST' : 'PUT';
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (!res.ok) throw new Error('save failed');
            cancel();
            await refresh();
        } catch (e) {
            console.error('Failed to save counselor', e);
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id: number) => {
        if (!window.confirm(t('admin.counselors.confirmDelete'))) return;
        try {
            const res = await fetch(`/api/admin/counselors/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('delete failed');
            await refresh();
        } catch (e) {
            console.error('Failed to delete counselor', e);
        }
    };

    const inputCls = 'h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-sky-400';

    const renderForm = () => (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="flex flex-col text-xs font-medium text-slate-500">{t('admin.counselors.slug')}
                    <input className={inputCls} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="marco" />
                </label>
                <label className="flex flex-col text-xs font-medium text-slate-500">{t('admin.counselors.name')}
                    <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </label>
                <label className="flex flex-col text-xs font-medium text-slate-500">{t('admin.counselors.avatar')}
                    <input className={inputCls} value={form.avatar} onChange={(e) => setForm({ ...form, avatar: e.target.value })} placeholder="https://..." />
                </label>
                <label className="flex flex-col text-xs font-medium text-slate-500">{t('admin.counselors.preset')}
                    <select className={inputCls} value={form.preset_id} onChange={(e) => setForm({ ...form, preset_id: e.target.value })}>
                        <option value="">{t('admin.counselors.noPreset')}</option>
                        {presets.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.provider}/{p.model})</option>)}
                    </select>
                </label>
                <div className="col-span-full">
                    <div className="mb-1 text-xs font-medium text-slate-500">{t('admin.counselors.language')}</div>
                    <div className="flex flex-wrap gap-2">
                        <button key="*" type="button" onClick={() => toggleLang('*')} className={`rounded-md border px-2 py-1 text-xs font-medium ${form.language.includes('*') ? 'border-indigo-300 bg-indigo-100 text-indigo-700' : 'border-slate-200 bg-white text-slate-500'}`}>{t('admin.counselors.allLanguages') || 'Tutte (*)'}</button>
                        {LANGUAGES.map((l) => (
                            <button key={l.code} type="button" onClick={() => toggleLang(l.code)} className={`rounded-md border px-2 py-1 text-xs font-medium ${form.language.includes(l.code) ? 'border-indigo-300 bg-indigo-100 text-indigo-700' : 'border-slate-200 bg-white text-slate-500'}`}>{l.label}</button>
                        ))}
                    </div>
                </div>
                <label className="flex flex-col text-xs font-medium text-slate-500">{t('admin.counselors.order')}
                    <input className={inputCls} type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
                </label>
            </div>
            <label className="mt-3 flex flex-col text-xs font-medium text-slate-500">{t('admin.counselors.description')}
                <input className={inputCls} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <label className="mt-3 flex flex-col text-xs font-medium text-slate-500">{t('admin.counselors.persona')}
                <textarea className="min-h-[90px] w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 outline-none focus:border-sky-400" value={form.persona} onChange={(e) => setForm({ ...form, persona: e.target.value })} />
            </label>
            <div className="mt-3">
                <div className="mb-1 text-xs font-medium text-slate-500">{t('admin.counselors.questionnaires')}</div>
                <div className="flex flex-wrap gap-2">
                    {QTYPES.map((q) => (
                        <button key={q} type="button" onClick={() => toggleQ(q)} className={`rounded-md border px-2 py-1 text-xs font-medium ${form.questionnaire_types.includes(q) ? 'border-indigo-300 bg-indigo-100 text-indigo-700' : 'border-slate-200 bg-white text-slate-500'}`}>{q}</button>
                    ))}
                </div>
            </div>
            <div className="mt-3 flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                    {t('admin.counselors.active')}
                </label>
                <button type="button" disabled={saving} onClick={() => void save()} className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                    <Check className="h-4 w-4" />{t('admin.counselors.save')}
                </button>
                <button type="button" onClick={cancel} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50">
                    <X className="h-4 w-4" />{t('admin.counselors.cancel')}
                </button>
            </div>
        </div>
    );

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
                <div>
                    <h2 className="text-lg font-bold text-slate-900">{t('admin.counselors.title')}</h2>
                    <p className="text-sm text-slate-500">{t('admin.counselors.subtitle')}</p>
                </div>
                {editingId === null && (
                    <button type="button" onClick={startNew} className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700">
                        <Plus className="h-4 w-4" />{t('admin.counselors.add')}
                    </button>
                )}
            </div>

            {editingId === 'new' && renderForm()}

            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                        <tr>
                            <th className="px-3 py-2 font-semibold">{t('admin.counselors.name')}</th>
                            <th className="px-3 py-2 font-semibold">{t('admin.counselors.preset')}</th>
                            <th className="px-3 py-2 font-semibold">{t('admin.counselors.questionnaires')}</th>
                            <th className="px-3 py-2 font-semibold">{t('admin.counselors.active')}</th>
                            <th className="px-3 py-2 text-right font-semibold">{t('admin.counselors.actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading && <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">…</td></tr>}
                        {!loading && counselors.length === 0 && editingId !== 'new' && (
                            <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">{t('admin.counselors.empty')}</td></tr>
                        )}
                        {counselors.map((c) => (
                            editingId === c.id ? (
                                <tr key={c.id}><td colSpan={5} className="px-3 py-3">{renderForm()}</td></tr>
                            ) : (
                                <tr key={c.id}>
                                    <td className="px-3 py-2 font-medium text-slate-800">
                                        {c.name}
                                        <span className="ml-2 font-mono text-xs text-slate-400">{c.slug}</span>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-slate-500">{c.provider ? `${c.provider}/${c.model}` : '-'}</td>
                                    <td className="px-3 py-2 text-xs text-slate-500">{(c.questionnaire_types || []).join(', ') || '-'}</td>
                                    <td className="px-3 py-2">{c.is_active ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-slate-300" />}</td>
                                    <td className="px-3 py-2">
                                        <div className="flex justify-end gap-1">
                                            <button type="button" onClick={() => startEdit(c)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Pencil className="h-4 w-4" /></button>
                                            <button type="button" onClick={() => void remove(c.id)} className="rounded p-1.5 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
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
