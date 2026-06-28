'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Download, Loader2, Save } from 'lucide-react';
import { QUESTIONNAIRES, type QuestionnaireType } from '@/lib/questionnaires';
import { useI18n } from '@/lib/i18n-context';
import { toast } from '@/components/ui/Toast';

interface QuestionnaireResult {
    id: number;
    session_id: string;
    questionnaire_type: string;
    scores: Record<string, number> | null;
    submitted_at: string;
}

type BookletData = Record<string, string>;

const EMPTY_BOOKLET: BookletData = {
    student_name: '',
    class_context: '',
    school_year: '',
    strength: '',
    growth_area: '',
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

function toBookletData(raw: unknown): BookletData {
    const source = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
    const next = { ...EMPTY_BOOKLET };
    for (const key of Object.keys(next)) {
        const value = source[key];
        next[key] = value == null ? '' : String(value);
    }
    return next;
}

export function StudentBookletCard({ session, lang }: { session: QuestionnaireResult | null; lang: string }) {
    const { t, tf } = useI18n();
    const [form, setForm] = useState<BookletData>(EMPTY_BOOKLET);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [downloading, setDownloading] = useState(false);

    const factorOptions = useMemo(() => {
        if (!session || !session.scores || session.questionnaire_type === 'SAVICKAS') return [];
        const config = QUESTIONNAIRES[session.questionnaire_type as QuestionnaireType];
        const orderedCodes = config?.factors.map((factor) => factor.code) || Object.keys(session.scores);
        return orderedCodes
            .filter((code) => session.scores && session.scores[code] !== undefined)
            .map((code) => {
                const factor = config?.factors.find((item) => item.code === code);
                const label = tf(`factor.${code}.name`, factor?.name || code);
                const value = session.scores?.[code];
                return { value: `${code} - ${label}${value ? ` (${value}/9)` : ''}`, label: `${code} - ${label}${value ? ` (${value}/9)` : ''}` };
            });
    }, [session, tf]);

    useEffect(() => {
        if (!session) {
            setForm(EMPTY_BOOKLET);
            return;
        }
        let active = true;
        setLoading(true);
        fetch(`/api/user/student-booklets/${encodeURIComponent(session.session_id)}`)
            .then(async (res) => {
                if (!active) return;
                if (res.ok) {
                    const data = await res.json();
                    setForm(toBookletData(data?.data));
                } else {
                    setForm(EMPTY_BOOKLET);
                }
            })
            .catch(() => {
                if (active) setForm(EMPTY_BOOKLET);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, [session]);

    const setValue = (key: keyof BookletData, value: string) => {
        setForm((prev) => ({ ...prev, [key]: value }));
    };

    const saveBooklet = async (showToast = true) => {
        if (!session) return false;
        setSaving(true);
        try {
            const res = await fetch(`/api/user/student-booklets/${encodeURIComponent(session.session_id)}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: form }),
            });
            if (!res.ok) throw new Error('Save failed');
            const data = await res.json();
            setForm(toBookletData(data.data));
            if (showToast) toast.success('Libretto salvato.');
            return true;
        } catch (e) {
            console.error('Failed to save booklet', e);
            toast.error(t('toast.error'));
            return false;
        } finally {
            setSaving(false);
        }
    };

    const downloadPdf = async () => {
        if (!session) return;
        setDownloading(true);
        try {
            const saved = await saveBooklet(false);
            if (!saved) return;
            const res = await fetch(`/api/user/student-booklets/${encodeURIComponent(session.session_id)}/pdf?lang=${lang}`);
            if (!res.ok) throw new Error('PDF download failed');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `counselorbot_libretto_${session.questionnaire_type}_${session.session_id.slice(0, 8)}.pdf`;
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
                value={form[key]}
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
                value={form[key]}
                onChange={(event) => setValue(key, event.target.value)}
                className={inputClass}
            />
        </label>
    );

    const factorChoice = (key: keyof BookletData, label: string) => (
        <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
            {factorOptions.length > 0 ? (
                <select value={form[key]} onChange={(event) => setValue(key, event.target.value)} className={inputClass}>
                    <option value="">Scegli dal profilo...</option>
                    {factorOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                </select>
            ) : (
                <input
                    value={form[key]}
                    onChange={(event) => setValue(key, event.target.value)}
                    className={inputClass}
                    placeholder="Scrivi un tema o un aspetto emerso"
                />
            )}
        </label>
    );

    if (!session) return null;

    return (
        <section className="glass-panel p-5 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <BookOpen className="h-5 w-5 text-indigo-600" />
                        Libretto dello studente
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                        Compila il tuo libretto per trasformare il profilo in obiettivi, strategie e verifiche.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => void saveBooklet()}
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

            {loading ? (
                <div className="text-sm text-slate-400">Caricamento libretto...</div>
            ) : (
                <div className="space-y-6">
                    <div className="grid gap-3 md:grid-cols-3">
                        {simpleInput('student_name', 'Nome studente')}
                        {simpleInput('class_context', 'Classe / contesto')}
                        {simpleInput('school_year', 'Anno / percorso')}
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                        {factorChoice('strength', 'Punto di forza da valorizzare')}
                        {factorChoice('growth_area', 'Area da migliorare')}
                    </div>
                    {textField('motivation', 'Perche e importante per me', 2)}

                    <div className="grid gap-3 md:grid-cols-2">
                        {textField('objective', 'Obiettivo: mi propongo di...', 3)}
                        {textField('strategy', 'Strategia: mi impegno a...', 3)}
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
