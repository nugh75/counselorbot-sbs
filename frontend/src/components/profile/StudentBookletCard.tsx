'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { QUESTIONNAIRES, type QuestionnaireType } from '@/lib/questionnaires';
import { useI18n } from '@/lib/i18n-context';
import { toast } from '@/components/ui/Toast';

// Libretti narrativi senza dimensioni (fattori): eventi significativi.
export const EVENT_BOOKLET_TYPES = ['EVENTO_STUDIO', 'EVENTO_PROFESSIONALE'] as const;
export type BookletType = QuestionnaireType | (typeof EVENT_BOOKLET_TYPES)[number];

const BOOKLET_TYPE_LABEL: Record<string, string> = {
    EVENTO_STUDIO: 'Evento significativo di studio',
    EVENTO_PROFESSIONALE: 'Evento significativo professionale',
};

function isQuestionnaireType(type: BookletType): type is QuestionnaireType {
    return type in QUESTIONNAIRES;
}

export function bookletTypeOptionLabel(type: BookletType): string {
    if (isQuestionnaireType(type)) return `${type} · ${QUESTIONNAIRES[type].fullName}`;
    return BOOKLET_TYPE_LABEL[type] ?? type;
}

type BookletData = {
    title: string;
    strength: string[];
    growth_area: string[];
    motivation: string;
    objective: string;
    strategy: string;
    period_start: string;
    period_end: string;
    commitment: string;
    difficulties: string;
    improvements: string;
    discovery: string;
    bio_date: string;
    bio_context: string;
    bio_discovery: string;
    bio_keywords: string;
    student_notes: string;
    final_satisfaction: string;
    final_observations: string;
};

type BookletSummary = { id: number; data: Record<string, unknown>; updated_at?: string | null };

type CertifiedStrategy = {
    slug: string;
    name: string;
    recommended_when: string;
    description: string;
    factor_codes: string[];
};

const ARRAY_KEYS = ['strength', 'growth_area'] as const;

const EMPTY_BOOKLET: BookletData = {
    title: '',
    strength: [''],
    growth_area: [''],
    motivation: '',
    objective: '',
    strategy: '',
    period_start: '',
    period_end: '',
    commitment: '',
    difficulties: '',
    improvements: '',
    discovery: '',
    bio_date: '',
    bio_context: '',
    bio_discovery: '',
    bio_keywords: '',
    student_notes: '',
    final_satisfaction: '',
    final_observations: '',
};

function toStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        const items = value.map((item) => (item == null ? '' : String(item)));
        return items.length > 0 ? items : [''];
    }
    if (value == null || value === '') return [''];
    return [String(value)];
}

function toBookletData(raw: unknown): BookletData {
    const source = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
    const next = { ...EMPTY_BOOKLET, strength: [...EMPTY_BOOKLET.strength], growth_area: [...EMPTY_BOOKLET.growth_area] };
    for (const key of Object.keys(next) as (keyof BookletData)[]) {
        if ((ARRAY_KEYS as readonly string[]).includes(key)) {
            (next[key] as string[]) = toStringArray(source[key]);
        } else {
            const value = source[key];
            (next[key] as string) = value == null ? '' : String(value);
        }
    }
    return next;
}

function bookletTitle(summary: BookletSummary, fallback: string): string {
    const raw = summary.data?.title;
    const title = typeof raw === 'string' ? raw.trim() : '';
    return title || fallback;
}

export function StudentBookletCard({ questionnaireType, lang }: { questionnaireType: BookletType; lang: string }) {
    const { t, tf } = useI18n();
    const [booklets, setBooklets] = useState<BookletSummary[]>([]);
    const [currentId, setCurrentId] = useState<number | null>(null);
    const [form, setForm] = useState<BookletData>(EMPTY_BOOKLET);
    const [strategies, setStrategies] = useState<CertifiedStrategy[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [downloading, setDownloading] = useState(false);

    const factorOptions = useMemo(() => {
        if (!isQuestionnaireType(questionnaireType) || questionnaireType === 'SAVICKAS') return [];
        const config = QUESTIONNAIRES[questionnaireType];
        return (config?.factors || []).map((factor) => {
            const label = tf(`factor.${factor.code}.name`, factor.name);
            return { value: `${factor.code} - ${label}`, label: `${factor.code} - ${label}` };
        });
    }, [questionnaireType, tf]);

    const loadBooklet = useCallback(async (id: number) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/user/student-booklets/id/${id}`);
            if (!res.ok) throw new Error('Load failed');
            const data = await res.json();
            setCurrentId(id);
            setForm(toBookletData(data?.data));
        } catch (e) {
            console.error('Failed to load booklet', e);
            toast.error(t('toast.error'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    // Carica l'elenco delle schede per lo strumento + le strategie certificate.
    useEffect(() => {
        let active = true;
        setLoading(true);
        setCurrentId(null);
        setForm(EMPTY_BOOKLET);
        fetch(`/api/user/certified-strategies?questionnaire_type=${encodeURIComponent(questionnaireType)}&lang=${lang}`)
            .then((res) => (res.ok ? res.json() : []))
            .then((data) => { if (active) setStrategies(Array.isArray(data) ? data : []); })
            .catch(() => { if (active) setStrategies([]); });
        fetch(`/api/user/student-booklets/instrument/${encodeURIComponent(questionnaireType)}/list`)
            .then(async (res) => {
                if (!active) return;
                const list: BookletSummary[] = res.ok ? await res.json() : [];
                setBooklets(list);
                if (list.length > 0) {
                    setCurrentId(list[0].id);
                    setForm(toBookletData(list[0].data));
                }
            })
            .catch(() => { if (active) setBooklets([]); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [questionnaireType, lang]);

    const refreshList = useCallback(async () => {
        try {
            const res = await fetch(`/api/user/student-booklets/instrument/${encodeURIComponent(questionnaireType)}/list`);
            if (res.ok) setBooklets(await res.json());
        } catch {
            /* ignore */
        }
    }, [questionnaireType]);

    const setValue = (key: keyof BookletData, value: string) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const setArrayItem = (key: 'strength' | 'growth_area', index: number, value: string) => {
        setForm((prev) => {
            const arr = [...prev[key]];
            arr[index] = value;
            return { ...prev, [key]: arr };
        });
    };

    const addArrayItem = (key: 'strength' | 'growth_area') => {
        setForm((prev) => ({ ...prev, [key]: [...prev[key], ''] }));
    };

    const removeArrayItem = (key: 'strength' | 'growth_area', index: number) => {
        setForm((prev) => {
            const arr = prev[key].filter((_, i) => i !== index);
            return { ...prev, [key]: arr.length > 0 ? arr : [''] };
        });
    };

    const appendStrategy = (slug: string) => {
        const strategy = strategies.find((s) => s.slug === slug);
        if (!strategy) return;
        const snippet = strategy.description?.trim() || strategy.name;
        setForm((prev) => ({
            ...prev,
            strategy: prev.strategy.trim() ? `${prev.strategy.trim()}\n- ${snippet}` : `- ${snippet}`,
        }));
    };

    const persist = async (showToast = true): Promise<number | null> => {
        setSaving(true);
        try {
            const isUpdate = currentId != null;
            const url = isUpdate
                ? `/api/user/student-booklets/id/${currentId}`
                : `/api/user/student-booklets/instrument/${encodeURIComponent(questionnaireType)}`;
            const res = await fetch(url, {
                method: isUpdate ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: form }),
            });
            if (!res.ok) throw new Error('Save failed');
            const data = await res.json();
            setCurrentId(data.id);
            setForm(toBookletData(data.data));
            await refreshList();
            if (showToast) toast.success('Scheda salvata.');
            return data.id as number;
        } catch (e) {
            console.error('Failed to save booklet', e);
            toast.error(t('toast.error'));
            return null;
        } finally {
            setSaving(false);
        }
    };

    const createBooklet = async () => {
        setSaving(true);
        try {
            const title = `Scheda ${booklets.length + 1}`;
            const res = await fetch(`/api/user/student-booklets/instrument/${encodeURIComponent(questionnaireType)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: { ...EMPTY_BOOKLET, title } }),
            });
            if (!res.ok) throw new Error('Create failed');
            const data = await res.json();
            setCurrentId(data.id);
            setForm(toBookletData(data.data));
            await refreshList();
        } catch (e) {
            console.error('Failed to create booklet', e);
            toast.error(t('toast.error'));
        } finally {
            setSaving(false);
        }
    };

    const deleteBooklet = async () => {
        if (currentId == null) return;
        if (!window.confirm('Eliminare questa scheda?')) return;
        try {
            const res = await fetch(`/api/user/student-booklets/id/${currentId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Delete failed');
            const remaining = booklets.filter((b) => b.id !== currentId);
            setBooklets(remaining);
            if (remaining.length > 0) {
                await loadBooklet(remaining[0].id);
            } else {
                setCurrentId(null);
                setForm(EMPTY_BOOKLET);
            }
            toast.success('Scheda eliminata.');
        } catch (e) {
            console.error('Failed to delete booklet', e);
            toast.error(t('toast.error'));
        }
    };

    const downloadPdf = async () => {
        setDownloading(true);
        try {
            const id = await persist(false);
            if (id == null) return;
            const res = await fetch(`/api/user/student-booklets/id/${id}/pdf?lang=${lang}`);
            if (!res.ok) throw new Error('PDF download failed');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `counselorbot_libretto_${questionnaireType}_${id}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Failed to download booklet PDF', e);
            toast.error(t('toast.error'));
        } finally {
            setDownloading(false);
        }
    };

    const inputClass = 'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400';

    const textField = (key: keyof BookletData, label: string, rows = 2) => (
        <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
            <textarea
                value={form[key] as string}
                onChange={(event) => setValue(key, event.target.value)}
                rows={rows}
                className={`${inputClass} resize-y`}
            />
        </label>
    );

    const simpleInput = (key: keyof BookletData, label: string, type = 'text') => (
        <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
            <input
                type={type}
                value={form[key] as string}
                onChange={(event) => setValue(key, event.target.value)}
                className={inputClass}
            />
        </label>
    );

    const factorRow = (key: 'strength' | 'growth_area', index: number) => (
        <div key={index} className="flex items-center gap-2">
            {factorOptions.length > 0 ? (
                <select
                    value={form[key][index]}
                    onChange={(event) => setArrayItem(key, index, event.target.value)}
                    className={`${inputClass} mt-0`}
                >
                    <option value="">Scegli dallo strumento...</option>
                    {factorOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </select>
            ) : (
                <input
                    value={form[key][index]}
                    onChange={(event) => setArrayItem(key, index, event.target.value)}
                    className={`${inputClass} mt-0`}
                    placeholder="Scrivi un tema o un aspetto emerso"
                />
            )}
            <button
                type="button"
                onClick={() => removeArrayItem(key, index)}
                className="shrink-0 rounded-md border border-slate-200 p-2 text-slate-400 hover:bg-slate-50 hover:text-rose-500"
                aria-label="Rimuovi"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );

    const factorMulti = (key: 'strength' | 'growth_area', label: string) => (
        <div className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
            <div className="mt-1 space-y-2">
                {form[key].map((_, index) => factorRow(key, index))}
            </div>
            <button
                type="button"
                onClick={() => addArrayItem(key)}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
                <Plus className="h-3.5 w-3.5" /> Aggiungi
            </button>
        </div>
    );

    return (
        <section className="glass-panel p-5 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-slate-800">
                        Libretto dello studente · {isQuestionnaireType(questionnaireType) ? questionnaireType : BOOKLET_TYPE_LABEL[questionnaireType]}
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                        Crea piu schede per lo stesso strumento: ognuna diventa un percorso con obiettivi, strategie e verifiche.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => void persist()}
                        disabled={saving || loading}
                        className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Salva
                    </button>
                    <button
                        type="button"
                        onClick={() => void downloadPdf()}
                        disabled={downloading || loading}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                        {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        Scarica PDF
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
                {booklets.map((b) => (
                    <button
                        key={b.id}
                        type="button"
                        onClick={() => void loadBooklet(b.id)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                            b.id === currentId
                                ? 'bg-indigo-600 text-white'
                                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                        {bookletTitle(b, `Scheda ${b.id}`)}
                    </button>
                ))}
                <button
                    type="button"
                    onClick={() => void createBooklet()}
                    disabled={saving}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-indigo-300 px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
                >
                    <Plus className="h-3.5 w-3.5" /> Nuova scheda
                </button>
                {currentId != null && (
                    <button
                        type="button"
                        onClick={() => void deleteBooklet()}
                        className="ml-auto inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                    >
                        <Trash2 className="h-3.5 w-3.5" /> Elimina
                    </button>
                )}
            </div>

            {loading ? (
                <div className="text-sm text-slate-400">Caricamento libretto...</div>
            ) : booklets.length === 0 && currentId == null ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                    Nessuna scheda per questo strumento. Crea la prima con &ldquo;Nuova scheda&rdquo; o compila e premi Salva.
                </div>
            ) : (
                <div className="space-y-6">
                    {simpleInput('title', 'Titolo della scheda')}

                    <div className="grid gap-3 md:grid-cols-2">
                        {factorMulti('strength', 'Punti di forza da valorizzare')}
                        {factorMulti('growth_area', 'Aree da migliorare')}
                    </div>
                    {textField('motivation', 'Perche e importante per me', 2)}

                    <div className="grid gap-3 md:grid-cols-2">
                        {textField('objective', 'Obiettivo: mi propongo di...', 3)}
                        <div className="block">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Strategia: mi impegno a...</span>
                            {strategies.length > 0 && (
                                <select
                                    value=""
                                    onChange={(event) => { appendStrategy(event.target.value); event.target.value = ''; }}
                                    className={inputClass}
                                >
                                    <option value="">Inserisci una strategia certificata...</option>
                                    {strategies.map((s) => (
                                        <option key={s.slug} value={s.slug}>{s.name}</option>
                                    ))}
                                </select>
                            )}
                            <textarea
                                value={form.strategy}
                                onChange={(event) => setValue('strategy', event.target.value)}
                                rows={3}
                                className={`${inputClass} resize-y`}
                            />
                        </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                        {simpleInput('period_start', 'Da', 'date')}
                        {simpleInput('period_end', 'A', 'date')}
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                        <label className="block">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ho rispettato gli impegni?</span>
                            <select value={form.commitment} onChange={(event) => setValue('commitment', event.target.value)} className={inputClass}>
                                <option value="">Seleziona...</option>
                                <option value="Si, del tutto">Si, del tutto</option>
                                <option value="Si, abbastanza">Si, abbastanza</option>
                                <option value="No, solo in parte">No, solo in parte</option>
                                <option value="No, per niente">No, per niente</option>
                            </select>
                        </label>
                        <label className="block">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Valutazione finale</span>
                            <select value={form.final_satisfaction} onChange={(event) => setValue('final_satisfaction', event.target.value)} className={inputClass}>
                                <option value="">Seleziona...</option>
                                <option value="Molto">Molto</option>
                                <option value="Abbastanza">Abbastanza</option>
                                <option value="Poco">Poco</option>
                                <option value="Per niente">Per niente</option>
                            </select>
                        </label>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                        {textField('difficulties', 'Difficolta incontrate', 3)}
                        {textField('improvements', 'Miglioramenti osservati', 3)}
                        {textField('discovery', 'Cosa ho capito o scoperto', 3)}
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                        <h3 className="text-sm font-bold text-slate-800">Biografia di apprendimento</h3>
                        <div className="grid gap-3 md:grid-cols-4">
                            {simpleInput('bio_date', 'Data', 'date')}
                            {simpleInput('bio_context', 'In occasione di')}
                            {simpleInput('bio_discovery', 'Ho scoperto che')}
                            {simpleInput('bio_keywords', 'Parole chiave')}
                        </div>
                    </div>

                    {textField('student_notes', 'Note studente', 4)}
                    {textField('final_observations', 'Osservazioni finali', 3)}
                </div>
            )}
        </section>
    );
}
