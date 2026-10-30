'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Loader2, MessageSquare, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { Button } from '@/components/ui/Button';

interface Preset {
    id: number;
    name: string;
    provider: string;
    model: string;
    is_active: boolean;
    provider_configured: boolean;
}

interface SummaryRow {
    provider?: string;
    model?: string;
    name?: string;
    quality?: number;
    tok_s?: number;
    reliability?: number;
    cost_usd?: number;
    score?: number;
    error?: string;
}

interface BenchRun {
    id: number;
    run_id: string;
    status: string;
    language: string;
    summary: SummaryRow[] | null;
    error: string | null;
    created_at: string;
    finished_at: string | null;
}

interface DetailStep {
    provider: string;
    model: string;
    preset_name: string;
    step_label: string;
    quality: number;
    cost_usd: number | null;
    bot_response: string;
    error: string | null;
}

const fmtCost = (v?: number | null) => (typeof v === 'number' ? `$${v.toFixed(6)}` : '-');
const fmtNum = (v?: number | null, d = 2) => (typeof v === 'number' ? v.toFixed(d) : '-');

export function BenchmarkPanel() {
    const { t } = useI18n();
    const [presets, setPresets] = useState<Preset[]>([]);
    const [selected, setSelected] = useState<number[]>([]);
    const [language, setLanguage] = useState('it');
    const [current, setCurrent] = useState<BenchRun | null>(null);
    const [runs, setRuns] = useState<BenchRun[]>([]);
    const [detail, setDetail] = useState<{ run_id: string; steps: DetailStep[] } | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [loading, setLoading] = useState(true);

    const fetchRuns = useCallback(async () => {
        const res = await fetch('/api/admin/benchmark/runs');
        if (res.ok) setRuns(await res.json());
    }, []);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const [pr, rr] = await Promise.all([
                fetch('/api/admin/presets'),
                fetch('/api/admin/benchmark/runs'),
            ]);
            if (pr.ok) setPresets((await pr.json()).filter((p: Preset) => p.is_active));
            if (rr.ok) setRuns(await rr.json());
        } catch (e) {
            console.error('Failed to load benchmark data', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

    const pollRun = useCallback((runId: string) => {
        stopPoll();
        pollRef.current = setInterval(async () => {
            const res = await fetch(`/api/admin/benchmark/runs/${runId}`);
            if (!res.ok) return;
            const run: BenchRun = await res.json();
            setCurrent(run);
            if (run.status === 'done' || run.status === 'error') {
                stopPoll();
                void fetchRuns();
            }
        }, 4000);
    }, [fetchRuns]);

    useEffect(() => () => stopPoll(), []);

    const toggle = (id: number) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

    const runBenchmark = async () => {
        if (selected.length === 0) return;
        const res = await fetch('/api/admin/benchmark/run', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ preset_ids: selected, language }),
        });
        if (!res.ok) { console.error('benchmark start failed'); return; }
        const run: BenchRun = await res.json();
        setCurrent(run);
        pollRun(run.run_id);
    };

    const loadRun = async (runId: string) => {
        const res = await fetch(`/api/admin/benchmark/runs/${runId}`);
        if (res.ok) {
            const run: BenchRun = await res.json();
            setCurrent(run);
            if (run.status === 'running' || run.status === 'queued') pollRun(run.run_id);
        }
    };

    const openDetail = async (runId: string) => {
        const res = await fetch(`/api/admin/benchmark/runs/${runId}/detail`);
        if (res.ok) setDetail(await res.json());
    };

    const isRunning = current && (current.status === 'running' || current.status === 'queued');
    const sortedSummary = (current?.summary || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0));

    return (
        <div className="space-y-4">
            <div className="rounded-lg border border-line bg-surface p-4">
                <h2 className="text-lg font-semibold text-ink">{t('admin.bench.title')}</h2>
                <p className="text-sm text-ink-muted">{t('admin.bench.subtitle')}</p>

                <div className="mt-4">
                    <div className="mb-2 text-xs font-semibold text-ink-muted">{t('admin.bench.selectPresets')}</div>
                    {loading ? (
                        <div className="flex items-center gap-2 text-sm text-ink-muted"><Loader2 className="h-4 w-4 animate-spin" /></div>
                    ) : presets.length === 0 ? (
                        <div className="rounded-control border border-dashed border-line-strong p-4 text-sm text-ink-muted">{t('admin.bench.noPresets')}</div>
                    ) : (
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {presets.map((p) => (
                                <label key={p.id} className={`flex items-center gap-2 rounded-control border p-2 text-sm ${selected.includes(p.id) ? 'border-brand-line bg-brand-soft' : 'border-line'} ${!p.provider_configured ? 'opacity-60' : ''}`}>
                                    <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} disabled={!p.provider_configured} />
                                    <span className="font-semibold text-ink">{p.name}</span>
                                    <span className="ml-auto font-mono text-xs text-ink-muted">{p.provider}/{p.model}</span>
                                </label>
                            ))}
                        </div>
                    )}
                </div>

                <div className="mt-4 flex items-center gap-4">
                    <select value={language} onChange={(e) => setLanguage(e.target.value)} className="h-control rounded-control border border-line bg-surface px-2 text-sm">
                        <option value="it">it</option>
                        <option value="en">en</option>
                    </select>
                    <Button type="button" disabled={selected.length === 0 || !!isRunning} onClick={() => void runBenchmark()}>
                        {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        {isRunning ? t('admin.bench.running') : t('admin.bench.run')}
                    </Button>
                </div>
            </div>

            {current && (
                <div className="rounded-lg border border-line bg-surface p-4">
                    <div className="mb-4 flex items-center justify-between">
                        <span className="font-mono text-xs text-ink-muted">{current.run_id}</span>
                        <span className={`rounded px-2 py-1 text-xs font-semibold ${current.status === 'done' ? 'bg-success-soft text-success' : current.status === 'error' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'}`}>{current.status}</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="border-b border-line text-xs text-ink-muted">
                                <tr>
                                    <th className="px-4 py-2 font-semibold">{t('admin.bench.colModel')}</th>
                                    <th className="px-4 py-2 font-semibold">{t('admin.bench.colProvider')}</th>
                                    <th className="px-4 py-2 text-right font-semibold">{t('admin.bench.colQuality')}</th>
                                    <th className="px-4 py-2 text-right font-semibold">{t('admin.bench.colTokS')}</th>
                                    <th className="px-4 py-2 text-right font-semibold">{t('admin.bench.colReliability')}</th>
                                    <th className="px-4 py-2 text-right font-semibold">{t('admin.bench.colCost')}</th>
                                    <th className="px-4 py-2 text-right font-semibold">{t('admin.bench.colScore')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-line">
                                {sortedSummary.map((r, i) => (
                                    <tr key={i} className={r.error ? 'bg-danger-soft' : ''}>
                                        <td className="px-4 py-2 font-semibold text-ink">{r.name || r.model}</td>
                                        <td className="px-4 py-2 text-ink-muted">{r.provider}</td>
                                        <td className="px-4 py-2 text-right">{r.error ? <span className="text-danger">err</span> : fmtNum(r.quality)}</td>
                                        <td className="px-4 py-2 text-right text-ink-muted">{fmtNum(r.tok_s, 1)}</td>
                                        <td className="px-4 py-2 text-right text-ink-muted">{typeof r.reliability === 'number' ? `${Math.round(r.reliability * 100)}%` : '-'}</td>
                                        <td className="px-4 py-2 text-right text-ink-muted">{fmtCost(r.cost_usd)}</td>
                                        <td className="px-4 py-2 text-right font-semibold text-ink">{fmtNum(r.score, 3)}</td>
                                    </tr>
                                ))}
                                {sortedSummary.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-ink-muted"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></td></tr>}
                            </tbody>
                        </table>
                    </div>
                    {current.status === 'done' && (
                        <button type="button" onClick={() => void openDetail(current.run_id)} className="min-h-control mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:text-link">
                            <MessageSquare className="h-4 w-4" />{t('admin.bench.viewDetail')}
                        </button>
                    )}
                </div>
            )}

            <div className="rounded-lg border border-line bg-surface p-4">
                <h3 className="mb-2 text-sm font-semibold text-ink-body">{t('admin.bench.history')}</h3>
                {runs.length === 0 ? (
                    <div className="text-sm text-ink-muted">{t('admin.bench.noRuns')}</div>
                ) : (
                    <div className="divide-y divide-line">
                        {runs.map((r) => (
                            <button key={r.id} type="button" onClick={() => void loadRun(r.run_id)} className="min-h-control flex w-full items-center justify-between py-2 text-left text-sm hover:bg-surface-sunken">
                                <span className="font-mono text-xs text-ink-muted">{r.run_id}</span>
                                <span className="text-xs text-ink-muted">{(r.summary || []).length} {t('admin.bench.models')}</span>
                                <span className={`rounded px-2 py-1 text-xs font-semibold ${r.status === 'done' ? 'bg-success-soft text-success' : r.status === 'error' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'}`}>{r.status}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {detail && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDetail(null)}>
                    <div className="max-h-[80vh] w-full max-w-3xl overflow-auto rounded-lg bg-surface p-4" onClick={(e) => e.stopPropagation()}>
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="font-semibold text-ink">{t('admin.bench.detail')}</h3>
                            <button type="button" onClick={() => setDetail(null)} className="inline-flex items-center justify-center min-h-control min-w-control rounded p-1 text-ink-muted hover:bg-surface-raised"><X className="h-5 w-5" /></button>
                        </div>
                        <div className="space-y-4">
                            {detail.steps.map((s, i) => (
                                <div key={i} className="rounded-control border border-line p-4">
                                    <div className="mb-1 flex items-center justify-between text-xs text-ink-muted">
                                        <span className="font-semibold">{s.preset_name} · {s.step_label}</span>
                                        <span>q {fmtNum(s.quality)} · {fmtCost(s.cost_usd)}</span>
                                    </div>
                                    {s.error ? <div className="text-sm text-danger">{s.error}</div> : (
                                        <div className="whitespace-pre-wrap break-words text-sm text-ink-body">{s.bot_response}</div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
