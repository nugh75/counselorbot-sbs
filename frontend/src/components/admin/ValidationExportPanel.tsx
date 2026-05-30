'use client';

import { useEffect, useMemo, useState } from 'react';
import { Database, Download, Filter, RefreshCw } from 'lucide-react';

interface Instrument {
    code: string;
    name_it: string | null;
    name_en: string | null;
    name_es: string | null;
    name_sv: string | null;
}

interface ValidationSummary {
    total: number;
    by_locale: Record<string, number>;
    by_version: Record<string, number>;
    latest_submitted_at: string | null;
}

interface ValidationResponse {
    id: number;
    session_id: string;
    instrument_code: string;
    locale: string;
    version_label: string;
    answers: Record<string, number> | null;
    factor_scores: Record<string, number> | null;
    username: string | null;
    duration_seconds: number | null;
    submitted_at: string;
}

const LOCALES = ['', 'it', 'en', 'es', 'sv'];

function queryString(filters: { instrument: string; locale: string; version: string }) {
    const params = new URLSearchParams();
    if (filters.instrument) params.set('instrument_code', filters.instrument);
    if (filters.locale) params.set('locale', filters.locale);
    if (filters.version.trim()) params.set('version_label', filters.version.trim());
    const qs = params.toString();
    return qs ? `?${qs}` : '';
}

export function ValidationExportPanel() {
    const [instruments, setInstruments] = useState<Instrument[]>([]);
    const [instrument, setInstrument] = useState('QSA');
    const [locale, setLocale] = useState('es');
    const [version, setVersion] = useState('QSA_es_2026_v1');
    const [summary, setSummary] = useState<ValidationSummary | null>(null);
    const [rows, setRows] = useState<ValidationResponse[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    const filters = useMemo(() => ({ instrument, locale, version }), [instrument, locale, version]);

    useEffect(() => {
        fetch('/api/admin/instruments')
            .then((r) => r.ok ? r.json() : [])
            .then((data: Instrument[]) => {
                setInstruments(data);
                if (!data.some((item) => item.code === instrument) && data[0]) {
                    setInstrument(data[0].code);
                }
            })
            .catch(() => setMessage('Errore nel caricamento degli strumenti.'));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const load = async () => {
        setLoading(true);
        setMessage('');
        try {
            const qs = queryString(filters);
            const [summaryRes, rowsRes] = await Promise.all([
                fetch(`/api/admin/validation/summary${qs}`),
                fetch(`/api/admin/validation/responses${qs}`),
            ]);
            if (!summaryRes.ok || !rowsRes.ok) throw new Error('load failed');
            setSummary(await summaryRes.json());
            setRows(await rowsRes.json());
        } catch {
            setMessage('Errore nel caricamento del dataset di validazione.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [instrument, locale, version]);

    const exportUrl = `/api/admin/validation/export.csv${queryString(filters)}`;

    return (
        <div className="space-y-5">
            <section className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950">
                Questa sezione prepara il dataset per la validazione psicometrica: salva ed esporta risposte grezze item-per-item, versione dello strumento, lingua, durata e punteggi sintetici. L&apos;analisi statistica resta esterna, ad esempio in R, JASP, SPSS o Mplus.
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <Filter className="h-4 w-4 text-indigo-600" />
                    Scelte di validazione
                </div>
                <div className="grid gap-4 md:grid-cols-4">
                    <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">Strumento</span>
                        <select
                            value={instrument}
                            onChange={(event) => setInstrument(event.target.value)}
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        >
                            {instruments.map((item) => (
                                <option key={item.code} value={item.code}>
                                    {item.code} - {item.name_es || item.name_en || item.code}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-xs font-semibold uppercase text-slate-500">Lingua</span>
                        <select
                            value={locale}
                            onChange={(event) => setLocale(event.target.value)}
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        >
                            {LOCALES.map((item) => (
                                <option key={item || 'all'} value={item}>
                                    {item || 'tutte'}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="block md:col-span-2">
                        <span className="text-xs font-semibold uppercase text-slate-500">Versione questionario</span>
                        <input
                            value={version}
                            onChange={(event) => setVersion(event.target.value)}
                            placeholder="es. QSA_es_2026_v1"
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                    </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={load}
                        className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Aggiorna
                    </button>
                    <a
                        href={exportUrl}
                        className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                        <Download className="h-4 w-4" />
                        Esporta CSV item-level
                    </a>
                </div>
                {message && <p className="mt-3 text-sm text-red-600">{message}</p>}
            </section>

            <section className="grid gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                        <Database className="h-4 w-4" />
                        Risposte
                    </div>
                    <p className="mt-2 text-3xl font-bold text-slate-900">{summary?.total ?? 0}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4 md:col-span-2">
                    <p className="text-xs font-semibold uppercase text-slate-500">Versioni</p>
                    <p className="mt-2 text-sm text-slate-700">
                        {summary && Object.keys(summary.by_version).length
                            ? Object.entries(summary.by_version).map(([key, value]) => `${key}: ${value}`).join(' · ')
                            : 'Nessuna versione raccolta'}
                    </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <p className="text-xs font-semibold uppercase text-slate-500">Ultima risposta</p>
                    <p className="mt-2 text-sm font-medium text-slate-700">
                        {summary?.latest_submitted_at ? new Date(summary.latest_submitted_at).toLocaleString('it-IT') : '-'}
                    </p>
                </div>
            </section>

            <section className="rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3">
                    <h2 className="text-sm font-semibold text-slate-900">Ultime risposte grezze</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-100 text-left text-xs uppercase text-slate-500">
                                <th className="px-4 py-2">Data</th>
                                <th className="px-4 py-2">Sessione</th>
                                <th className="px-4 py-2">Strumento</th>
                                <th className="px-4 py-2">Lingua</th>
                                <th className="px-4 py-2">Versione</th>
                                <th className="px-4 py-2">Item</th>
                                <th className="px-4 py-2">Durata</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.id} className="border-b border-slate-100">
                                    <td className="px-4 py-2 text-slate-600">{new Date(row.submitted_at).toLocaleString('it-IT')}</td>
                                    <td className="px-4 py-2 font-mono text-xs text-slate-500">{row.session_id}</td>
                                    <td className="px-4 py-2 font-semibold text-slate-800">{row.instrument_code}</td>
                                    <td className="px-4 py-2">{row.locale}</td>
                                    <td className="px-4 py-2">{row.version_label}</td>
                                    <td className="px-4 py-2">{row.answers ? Object.keys(row.answers).length : 0}</td>
                                    <td className="px-4 py-2">{row.duration_seconds ? `${row.duration_seconds}s` : '-'}</td>
                                </tr>
                            ))}
                            {!rows.length && (
                                <tr>
                                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                                        Nessuna risposta grezza trovata per questi filtri.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
