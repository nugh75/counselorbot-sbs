'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Plus, Trash2, Save, ListChecks, Sliders, FileText, Eye } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const LOCALES = ['it', 'en', 'es', 'sv'] as const;
type Locale = typeof LOCALES[number];
const ORIENTATIONS = ['resource', 'difficulty', 'neutral'] as const;

interface Instrument {
    code: string;
    name_it: string | null;
    name_en: string | null;
    name_es: string | null;
    name_sv: string | null;
    response_scale_min: number;
    response_scale_max: number;
    report_scale_type: string;
    status: string;
}

interface Factor {
    id: number;
    instrument_code: string;
    code: string;
    sort_order: number;
    dimension: string | null;
    orientation: string;
    is_interpretation_inverted: boolean;
    label_it: string | null;
    label_en: string | null;
    label_es: string | null;
    label_sv: string | null;
}

interface Item {
    id: number;
    instrument_code: string;
    item_number: number;
    sort_order: number;
    factor_code: string | null;
    reverse_scoring: boolean;
    text_it: string | null;
    text_en: string | null;
    text_es: string | null;
    text_sv: string | null;
    active: boolean;
}

interface RulesFactor {
    code: string;
    orientation: string;
    is_interpretation_inverted: boolean;
    label: string;
    item_numbers: number[];
    reverse_item_numbers: number[];
}

interface Rules {
    instrument: {
        code: string; name: string | null;
        response_scale_min: number; response_scale_max: number;
        report_scale_type: string; status: string;
    };
    uses_validated_norms: boolean;
    factors: RulesFactor[];
}

type SubTab = 'meta' | 'factors' | 'items' | 'rules';

export function QuestionnaireEditor() {
    const { t } = useI18n();
    const [instruments, setInstruments] = useState<Instrument[]>([]);
    const [selected, setSelected] = useState<string>('');
    const [subTab, setSubTab] = useState<SubTab>('meta');
    const [locale, setLocale] = useState<Locale>('en');
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState('');

    const [meta, setMeta] = useState<Instrument | null>(null);
    const [factors, setFactors] = useState<Factor[]>([]);
    const [items, setItems] = useState<Item[]>([]);
    const [rules, setRules] = useState<Rules | null>(null);

    const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 2500); };

    useEffect(() => {
        fetch('/api/admin/instruments')
            .then((r) => r.json())
            .then((data: Instrument[]) => {
                setInstruments(data);
                if (data.length && !selected) setSelected(data[0].code);
            })
            .catch(() => flash(t('admin.q.loadError')))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const loadInstrument = useCallback(async (code: string) => {
        if (!code) return;
        const [fRes, iRes] = await Promise.all([
            fetch(`/api/admin/instruments/${code}/factors`),
            fetch(`/api/admin/instruments/${code}/items`),
        ]);
        setMeta(instruments.find((x) => x.code === code) ?? null);
        setFactors(await fRes.json());
        setItems(await iRes.json());
    }, [instruments]);

    useEffect(() => { loadInstrument(selected); }, [selected, loadInstrument]);

    useEffect(() => {
        if (subTab !== 'rules' || !selected) return;
        fetch(`/api/instruments/${selected}/rules?locale=${locale}`)
            .then((r) => r.json())
            .then(setRules)
            .catch(() => flash(t('admin.q.loadError')));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subTab, selected, locale]);

    // --- Mutations ---
    const saveMeta = async () => {
        if (!meta) return;
        const res = await fetch(`/api/admin/instruments/${meta.code}`, {
            method: 'PUT', headers: JSON_HEADERS,
            body: JSON.stringify({
                name_it: meta.name_it, name_en: meta.name_en, name_es: meta.name_es, name_sv: meta.name_sv,
                response_scale_min: meta.response_scale_min, response_scale_max: meta.response_scale_max,
                report_scale_type: meta.report_scale_type, status: meta.status,
            }),
        });
        flash(res.ok ? t('admin.q.saved') : t('admin.q.saveError'));
    };

    const saveFactor = async (f: Factor) => {
        const res = await fetch(`/api/admin/factors/${f.id}`, {
            method: 'PUT', headers: JSON_HEADERS,
            body: JSON.stringify({
                code: f.code, sort_order: f.sort_order, dimension: f.dimension,
                orientation: f.orientation, is_interpretation_inverted: f.is_interpretation_inverted,
                label_it: f.label_it, label_en: f.label_en, label_es: f.label_es, label_sv: f.label_sv,
            }),
        });
        flash(res.ok ? t('admin.q.saved') : t('admin.q.saveError'));
    };

    const addFactor = async () => {
        const res = await fetch(`/api/admin/instruments/${selected}/factors`, {
            method: 'POST', headers: JSON_HEADERS,
            body: JSON.stringify({
                instrument_code: selected, code: 'NEW', sort_order: factors.length,
                orientation: 'resource', is_interpretation_inverted: false,
            }),
        });
        if (res.ok) { setFactors([...factors, await res.json()]); }
    };

    const deleteFactor = async (id: number) => {
        if (!confirm(t('admin.q.confirmDelete'))) return;
        const res = await fetch(`/api/admin/factors/${id}`, { method: 'DELETE' });
        if (res.ok) setFactors(factors.filter((x) => x.id !== id));
    };

    const saveItem = async (it: Item) => {
        const res = await fetch(`/api/admin/items/${it.id}`, {
            method: 'PUT', headers: JSON_HEADERS,
            body: JSON.stringify({
                item_number: it.item_number, sort_order: it.sort_order, factor_code: it.factor_code,
                reverse_scoring: it.reverse_scoring, active: it.active,
                text_it: it.text_it, text_en: it.text_en, text_es: it.text_es, text_sv: it.text_sv,
            }),
        });
        flash(res.ok ? t('admin.q.saved') : t('admin.q.saveError'));
    };

    const addItem = async () => {
        const nextNum = items.reduce((m, x) => Math.max(m, x.item_number), 0) + 1;
        const res = await fetch(`/api/admin/instruments/${selected}/items`, {
            method: 'POST', headers: JSON_HEADERS,
            body: JSON.stringify({
                instrument_code: selected, item_number: nextNum, sort_order: items.length,
                reverse_scoring: false, active: true,
            }),
        });
        if (res.ok) setItems([...items, await res.json()]);
    };

    const deleteItem = async (id: number) => {
        if (!confirm(t('admin.q.confirmDelete'))) return;
        const res = await fetch(`/api/admin/items/${id}`, { method: 'DELETE' });
        if (res.ok) setItems(items.filter((x) => x.id !== id));
    };

    const patchFactor = (id: number, patch: Partial<Factor>) =>
        setFactors(factors.map((f) => f.id === id ? { ...f, ...patch } : f));
    const patchItem = (id: number, patch: Partial<Item>) =>
        setItems(items.map((it) => it.id === id ? { ...it, ...patch } : it));

    if (loading) return <div className="text-slate-500">{t('admin.q.loading')}</div>;

    const subTabs: { id: SubTab; label: string; icon: typeof Sliders }[] = [
        { id: 'meta', label: t('admin.q.tab.meta'), icon: Sliders },
        { id: 'factors', label: t('admin.q.tab.factors'), icon: ListChecks },
        { id: 'items', label: t('admin.q.tab.items'), icon: FileText },
        { id: 'rules', label: t('admin.q.tab.rules'), icon: Eye },
    ];

    return (
        <div className="space-y-5">
            {/* Disclaimer metodologico */}
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {t('admin.q.disclaimer')}
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <select
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium"
                >
                    {instruments.map((i) => (
                        <option key={i.code} value={i.code}>{i.code} — {i.name_en ?? i.code}</option>
                    ))}
                </select>
                {meta && (
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        meta.status === 'validated' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'
                    }`}>
                        {meta.status}
                    </span>
                )}
                {msg && <span className="text-sm text-indigo-600">{msg}</span>}
                <button onClick={() => loadInstrument(selected)} className="ml-auto inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800">
                    <RefreshCw className="w-4 h-4" /> {t('admin.q.reload')}
                </button>
            </div>

            {/* Sub-tabs */}
            <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
                {subTabs.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        onClick={() => setSubTab(id)}
                        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${
                            subTab === id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                        <Icon className="w-4 h-4" /> {label}
                    </button>
                ))}
            </div>

            {/* META */}
            {subTab === 'meta' && meta && (
                <div className="space-y-4 max-w-2xl">
                    {LOCALES.map((l) => (
                        <label key={l} className="block">
                            <span className="text-xs font-semibold text-slate-500 uppercase">{t('admin.q.name')} ({l})</span>
                            <input
                                value={(meta[`name_${l}` as keyof Instrument] as string) ?? ''}
                                onChange={(e) => setMeta({ ...meta, [`name_${l}`]: e.target.value })}
                                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                            />
                        </label>
                    ))}
                    <div className="flex gap-4">
                        <label className="block">
                            <span className="text-xs font-semibold text-slate-500 uppercase">{t('admin.q.scaleMin')}</span>
                            <input type="number" value={meta.response_scale_min}
                                onChange={(e) => setMeta({ ...meta, response_scale_min: Number(e.target.value) })}
                                className="mt-1 w-24 rounded-md border border-slate-300 px-3 py-2 text-sm" />
                        </label>
                        <label className="block">
                            <span className="text-xs font-semibold text-slate-500 uppercase">{t('admin.q.scaleMax')}</span>
                            <input type="number" value={meta.response_scale_max}
                                onChange={(e) => setMeta({ ...meta, response_scale_max: Number(e.target.value) })}
                                className="mt-1 w-24 rounded-md border border-slate-300 px-3 py-2 text-sm" />
                        </label>
                        <label className="block">
                            <span className="text-xs font-semibold text-slate-500 uppercase">{t('admin.q.status')}</span>
                            <select value={meta.status}
                                onChange={(e) => setMeta({ ...meta, status: e.target.value })}
                                className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm">
                                <option value="experimental">experimental</option>
                                <option value="validated">validated</option>
                            </select>
                        </label>
                    </div>
                    <p className="text-xs text-slate-400">{t('admin.q.scaleHint')}</p>
                    <button onClick={saveMeta} className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
                        <Save className="w-4 h-4" /> {t('admin.q.save')}
                    </button>
                </div>
            )}

            {/* FACTORS */}
            {subTab === 'factors' && (
                <div className="space-y-3">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-slate-500 border-b">
                                    <th className="py-2 pr-2">{t('admin.q.code')}</th>
                                    <th className="py-2 pr-2">{t('admin.q.dimension')}</th>
                                    <th className="py-2 pr-2">{t('admin.q.orientation')}</th>
                                    <th className="py-2 pr-2">{t('admin.q.inverted')}</th>
                                    <th className="py-2 pr-2">{t('admin.q.label')} (it/en/es/sv)</th>
                                    <th className="py-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {factors.map((f) => (
                                    <tr key={f.id} className="border-b border-slate-100 align-top">
                                        <td className="py-2 pr-2">
                                            <input value={f.code} onChange={(e) => patchFactor(f.id, { code: e.target.value })}
                                                className="w-20 rounded border border-slate-300 px-2 py-1" />
                                        </td>
                                        <td className="py-2 pr-2">
                                            <input value={f.dimension ?? ''} onChange={(e) => patchFactor(f.id, { dimension: e.target.value })}
                                                className="w-28 rounded border border-slate-300 px-2 py-1" />
                                        </td>
                                        <td className="py-2 pr-2">
                                            <select value={f.orientation} onChange={(e) => patchFactor(f.id, { orientation: e.target.value })}
                                                className="rounded border border-slate-300 px-2 py-1">
                                                {ORIENTATIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                                            </select>
                                        </td>
                                        <td className="py-2 pr-2 text-center">
                                            <input type="checkbox" checked={f.is_interpretation_inverted}
                                                onChange={(e) => patchFactor(f.id, { is_interpretation_inverted: e.target.checked })} />
                                        </td>
                                        <td className="py-2 pr-2 space-y-1">
                                            {LOCALES.map((l) => (
                                                <input key={l} placeholder={l}
                                                    value={(f[`label_${l}` as keyof Factor] as string) ?? ''}
                                                    onChange={(e) => patchFactor(f.id, { [`label_${l}`]: e.target.value } as Partial<Factor>)}
                                                    className="w-full rounded border border-slate-300 px-2 py-1" />
                                            ))}
                                        </td>
                                        <td className="py-2 whitespace-nowrap">
                                            <button onClick={() => saveFactor(f)} className="text-indigo-600 hover:text-indigo-800 mr-2"><Save className="w-4 h-4" /></button>
                                            <button onClick={() => deleteFactor(f.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <button onClick={addFactor} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                        <Plus className="w-4 h-4" /> {t('admin.q.addFactor')}
                    </button>
                </div>
            )}

            {/* ITEMS */}
            {subTab === 'items' && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-500">{t('admin.q.editLocale')}:</span>
                        {LOCALES.map((l) => (
                            <button key={l} onClick={() => setLocale(l)}
                                className={`rounded px-2 py-0.5 ${locale === l ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                {l}
                            </button>
                        ))}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-slate-500 border-b">
                                    <th className="py-2 pr-2 w-12">#</th>
                                    <th className="py-2 pr-2">{t('admin.q.factor')}</th>
                                    <th className="py-2 pr-2">{t('admin.q.reverse')}</th>
                                    <th className="py-2 pr-2">{t('admin.q.active')}</th>
                                    <th className="py-2 pr-2">{t('admin.q.text')} ({locale})</th>
                                    <th className="py-2"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((it) => (
                                    <tr key={it.id} className="border-b border-slate-100 align-top">
                                        <td className="py-2 pr-2">
                                            <input type="number" value={it.item_number}
                                                onChange={(e) => patchItem(it.id, { item_number: Number(e.target.value) })}
                                                className="w-14 rounded border border-slate-300 px-2 py-1" />
                                        </td>
                                        <td className="py-2 pr-2">
                                            <select value={it.factor_code ?? ''} onChange={(e) => patchItem(it.id, { factor_code: e.target.value || null })}
                                                className="rounded border border-slate-300 px-2 py-1">
                                                <option value="">—</option>
                                                {factors.map((f) => <option key={f.id} value={f.code}>{f.code}</option>)}
                                            </select>
                                        </td>
                                        <td className="py-2 pr-2 text-center">
                                            <input type="checkbox" checked={it.reverse_scoring}
                                                onChange={(e) => patchItem(it.id, { reverse_scoring: e.target.checked })} />
                                        </td>
                                        <td className="py-2 pr-2 text-center">
                                            <input type="checkbox" checked={it.active}
                                                onChange={(e) => patchItem(it.id, { active: e.target.checked })} />
                                        </td>
                                        <td className="py-2 pr-2">
                                            <textarea
                                                value={(it[`text_${locale}` as keyof Item] as string) ?? ''}
                                                onChange={(e) => patchItem(it.id, { [`text_${locale}`]: e.target.value } as Partial<Item>)}
                                                rows={2}
                                                className="w-full min-w-[20rem] rounded border border-slate-300 px-2 py-1" />
                                        </td>
                                        <td className="py-2 whitespace-nowrap">
                                            <button onClick={() => saveItem(it)} className="text-indigo-600 hover:text-indigo-800 mr-2"><Save className="w-4 h-4" /></button>
                                            <button onClick={() => deleteItem(it.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <button onClick={addItem} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                        <Plus className="w-4 h-4" /> {t('admin.q.addItem')}
                    </button>
                </div>
            )}

            {/* RULES (read-only) */}
            {subTab === 'rules' && rules && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-slate-500">{t('admin.q.viewLocale')}:</span>
                        {LOCALES.filter((l) => l !== 'it').map((l) => (
                            <button key={l} onClick={() => setLocale(l)}
                                className={`rounded px-2 py-0.5 ${locale === l ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                {l}
                            </button>
                        ))}
                    </div>
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        {t('admin.q.rules.scale')}: <b>{rules.instrument.response_scale_min}–{rules.instrument.response_scale_max}</b> ·{' '}
                        {t('admin.q.rules.report')}: <b>{rules.instrument.report_scale_type}</b> ·{' '}
                        {t('admin.q.rules.norms')}: <b>{rules.uses_validated_norms ? t('admin.q.rules.normed') : t('admin.q.rules.experimental')}</b>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                        {rules.factors.map((f) => (
                            <div key={f.code} className="rounded-lg border border-slate-200 p-4">
                                <div className="flex items-center justify-between">
                                    <span className="font-semibold text-indigo-700">{f.code} — {f.label}</span>
                                    <span className="text-xs text-slate-400">{f.orientation}{f.is_interpretation_inverted ? ' · inv' : ''}</span>
                                </div>
                                <p className="mt-2 text-xs text-slate-500">
                                    {t('admin.q.rules.items')}: {f.item_numbers.join(', ') || '—'}
                                </p>
                                {f.reverse_item_numbers.length > 0 && (
                                    <p className="mt-1 text-xs text-amber-700">
                                        {t('admin.q.rules.reverse')}: {f.reverse_item_numbers.join(', ')}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
