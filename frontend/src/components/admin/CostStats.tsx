'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DollarSign, RefreshCw, Users, MessageSquare, Layers, TrendingUp, CalendarDays, Wallet, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';

interface ModelRow {
    model: string;
    provider: string;
    turns: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost: number;
    avg_cost_per_turn: number;
}

interface UserRow {
    anonymous_research_code: string;
    turns: number;
    sessions: number;
    cost: number;
    avg_cost_per_turn: number;
}

interface DayRow {
    date: string;
    cost: number;
    turns: number;
}

interface PeriodRow {
    period: string;
    start: string;
    cost: number;
    turns: number;
}

interface RunRate {
    period: string;
    cost_to_date: number;
    projected_cost: number;
    days_elapsed: number;
    days_total: number;
}

interface SplitBucket {
    cost: number;
    turns: number;
}

interface CostStatsData {
    currency: string;
    usd_eur_rate: number;
    total_cost: number;
    total_turns: number;
    paid_turns: number;
    distinct_sessions: number;
    distinct_users: number;
    avg_cost_per_turn: number;
    avg_cost_per_session: number;
    avg_cost_per_user: number;
    avg_turns_per_user: number;
    avg_turns_per_session: number;
    avg_sessions_per_user: number;
    monthly_budget_usd: number;
    budget_fallback_model: string;
    month_to_date_cost: number;
    budget_remaining: number;
    budget_exceeded: boolean;
    budget_used_pct: number;
    by_model: ModelRow[];
    by_user: UserRow[];
    by_day: DayRow[];
    by_week: PeriodRow[];
    by_month: PeriodRow[];
    by_year: PeriodRow[];
    periods: { week: RunRate; month: RunRate; year: RunRate };
    split: { production: SplitBucket; benchmark: SplitBucket };
}

type Granularity = 'day' | 'week' | 'month' | 'year';

const fmtCost = (value: number): string => `$${(value || 0).toFixed(6)}`;
const fmtInt = (value: number): string => new Intl.NumberFormat().format(value || 0);
const fmtEur = (value: number, rate: number): string => `€${((value || 0) * (rate || 0)).toFixed(6)}`;
const fmtUsdEur = (value: number, rate: number): string => `${fmtCost(value)} (≈ ${fmtEur(value, rate)})`;

export function CostStats() {
    const { t } = useI18n();
    const [data, setData] = useState<CostStatsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [estUsers, setEstUsers] = useState('100');
    const [granularity, setGranularity] = useState<Granularity>('month');
    const [eurRate, setEurRate] = useState('');
    const [intPerUser, setIntPerUser] = useState('');
    const [budgetInput, setBudgetInput] = useState('');
    const [savingBudget, setSavingBudget] = useState(false);

    const fetchStats = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (fromDate) params.set('from_date', `${fromDate}T00:00:00`);
            if (toDate) params.set('to_date', `${toDate}T23:59:59`);
            const res = await fetch(`/api/admin/cost-stats?${params.toString()}`);
            if (res.status === 401 || res.status === 403) {
                window.location.href = '/';
                return;
            }
            if (!res.ok) throw new Error('cost-stats fetch failed');
            setData(await res.json());
        } catch (error) {
            console.error('Failed to fetch cost stats', error);
        } finally {
            setLoading(false);
        }
    }, [fromDate, toDate]);

    useEffect(() => {
        void fetchStats();
    }, [fetchStats]);

    const maxDayCost = useMemo(
        () => (data?.by_day || []).reduce((max, d) => Math.max(max, d.cost), 0),
        [data],
    );

    const scenario = useMemo(() => {
        const users = Number(estUsers);
        const perUser = Number(intPerUser);
        const costPerInteraction = data?.avg_cost_per_turn || 0;
        const valid = !!data && Number.isFinite(users) && users > 0 && Number.isFinite(perUser) && perUser > 0;
        const totalInteractions = valid ? users * perUser : 0;
        const monthly = totalInteractions * costPerInteraction;
        return { monthly, yearly: monthly * 12, costPerInteraction, totalInteractions };
    }, [data, estUsers, intPerUser]);

    useEffect(() => {
        if (data && eurRate === '') setEurRate(String(data.usd_eur_rate || 0.92));
    }, [data, eurRate]);

    useEffect(() => {
        if (data && budgetInput === '') setBudgetInput(String(data.monthly_budget_usd || 0));
    }, [data, budgetInput]);

    useEffect(() => {
        if (data && intPerUser === '' && data.avg_turns_per_user > 0) {
            setIntPerUser(String(Math.round(data.avg_turns_per_user)));
        }
    }, [data, intPerUser]);

    const saveBudget = useCallback(async () => {
        setSavingBudget(true);
        try {
            const res = await fetch('/api/admin/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'monthly_budget_usd', value: String(Number(budgetInput) || 0) }),
            });
            if (!res.ok) throw new Error('budget save failed');
            await fetchStats();
        } catch (error) {
            console.error('Failed to save budget', error);
        } finally {
            setSavingBudget(false);
        }
    }, [budgetInput, fetchStats]);

    const rate = useMemo(() => {
        const r = Number(eurRate);
        return Number.isFinite(r) && r > 0 ? r : (data?.usd_eur_rate || 0);
    }, [eurRate, data]);

    const periodRows = useMemo<PeriodRow[]>(() => {
        if (!data) return [];
        if (granularity === 'week') return data.by_week;
        if (granularity === 'month') return data.by_month;
        if (granularity === 'year') return data.by_year;
        return data.by_day.map((d) => ({ period: d.date, start: d.date, cost: d.cost, turns: d.turns }));
    }, [data, granularity]);

    const maxPeriodCost = useMemo(
        () => periodRows.reduce((max, r) => Math.max(max, r.cost), 0),
        [periodRows],
    );

    const kpis = data
        ? [
              { icon: DollarSign, label: t('admin.costs.totalCost'), value: fmtUsdEur(data.total_cost, rate) },
              { icon: MessageSquare, label: t('admin.costs.paidTurns'), value: `${fmtInt(data.paid_turns)} / ${fmtInt(data.total_turns)}` },
              { icon: Users, label: t('admin.costs.users'), value: fmtInt(data.distinct_users) },
              { icon: TrendingUp, label: t('admin.costs.avgPerTurn'), value: fmtCost(data.avg_cost_per_turn) },
              { icon: Layers, label: t('admin.costs.avgPerSession'), value: fmtCost(data.avg_cost_per_session) },
              { icon: Users, label: t('admin.costs.avgPerUser'), value: fmtCost(data.avg_cost_per_user) },
          ]
        : [];

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4">
                <div>
                    <h2 className="text-lg font-bold text-slate-900">{t('admin.costs.title')}</h2>
                    <p className="text-sm text-slate-500">{t('admin.costs.subtitle')}</p>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                    <label className="flex flex-col text-xs font-medium text-slate-500">
                        {t('admin.costs.from')}
                        <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="mt-1 h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-sky-400" />
                    </label>
                    <label className="flex flex-col text-xs font-medium text-slate-500">
                        {t('admin.costs.to')}
                        <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="mt-1 h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-sky-400" />
                    </label>
                    <label className="flex flex-col text-xs font-medium text-slate-500">
                        {t('admin.costs.eurRate')}
                        <input type="number" min={0} step="0.01" value={eurRate} onChange={(e) => setEurRate(e.target.value)} className="mt-1 h-9 w-24 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-sky-400" />
                    </label>
                    <button type="button" onClick={() => void fetchStats()} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 hover:bg-slate-50">
                        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        {t('admin.costs.refresh')}
                    </button>
                </div>
            </div>

            {!data || (data.total_turns === 0) ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
                    {t('admin.costs.noData')}
                </div>
            ) : (
                <>
                    {/* KPI cards */}
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {kpis.map((kpi) => (
                            <div key={kpi.label} className="rounded-lg border border-slate-200 bg-white p-4">
                                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                                    <kpi.icon className="h-4 w-4" />
                                    {kpi.label}
                                </div>
                                <div className="mt-2 text-2xl font-bold text-slate-900">{kpi.value}</div>
                            </div>
                        ))}
                    </div>

                    {/* Run-rate: periodo corrente + proiezione */}
                    <div className="grid gap-3 sm:grid-cols-3">
                        {([
                            { key: 'month', label: t('admin.costs.thisMonth'), rr: data.periods.month },
                            { key: 'week', label: t('admin.costs.thisWeek'), rr: data.periods.week },
                            { key: 'year', label: t('admin.costs.thisYear'), rr: data.periods.year },
                        ] as const).map(({ key, label, rr }) => (
                            <div key={key} className="rounded-lg border border-slate-200 bg-white p-4">
                                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                                    <CalendarDays className="h-4 w-4" />
                                    {label} <span className="font-mono text-slate-300">{rr.period}</span>
                                </div>
                                <div className="mt-2 text-xl font-bold text-slate-900">{fmtUsdEur(rr.cost_to_date, rate)}</div>
                                <div className="mt-2 flex items-baseline justify-between">
                                    <span className="text-xs text-slate-500">{t('admin.costs.projected')}</span>
                                    <span className="text-lg font-bold text-emerald-600">{fmtUsdEur(rr.projected_cost, rate)}</span>
                                </div>
                                <div className="text-[11px] text-slate-400">{rr.days_elapsed} / {rr.days_total} {t('admin.costs.days')}</div>
                            </div>
                        ))}
                    </div>

                    {/* Costi per periodo: giorno / settimana / mese / anno */}
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-sm font-semibold text-slate-700">{t('admin.costs.byPeriod')}</h3>
                            <div className="inline-flex rounded-md border border-slate-200 p-0.5">
                                {(['day', 'week', 'month', 'year'] as const).map((g) => (
                                    <button
                                        key={g}
                                        type="button"
                                        onClick={() => setGranularity(g)}
                                        className={`rounded px-3 py-1 text-xs font-medium ${granularity === g ? 'bg-sky-500 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                                    >
                                        {t(`admin.costs.gran.${g}`)}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                                    <tr>
                                        <th className="px-3 py-2 font-semibold">{t('admin.costs.period')}</th>
                                        <th className="px-3 py-2 text-right font-semibold">{t('admin.costs.turns')}</th>
                                        <th className="px-3 py-2 font-semibold">{t('admin.costs.cost')}</th>
                                        <th className="px-3 py-2 text-right font-semibold">EUR</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {[...periodRows].reverse().map((row) => (
                                        <tr key={row.period}>
                                            <td className="px-3 py-2 font-mono text-xs font-medium text-slate-800">{row.period}</td>
                                            <td className="px-3 py-2 text-right text-slate-500">{fmtInt(row.turns)}</td>
                                            <td className="px-3 py-2">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-3 w-32 overflow-hidden rounded bg-slate-100">
                                                        <div className="h-full rounded bg-sky-400" style={{ width: maxPeriodCost > 0 ? `${Math.max(2, (row.cost / maxPeriodCost) * 100)}%` : '0%' }} />
                                                    </div>
                                                    <span className="font-medium text-slate-700">{fmtCost(row.cost)}</span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-2 text-right text-slate-500">{fmtEur(row.cost, rate)}</td>
                                        </tr>
                                    ))}
                                    {periodRows.length === 0 && (
                                        <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">{t('admin.costs.noData')}</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Budget mensile (kill-switch verso Ollama locale) */}
                    <div className={`rounded-lg border p-4 ${data.budget_exceeded ? 'border-rose-300 bg-rose-50/50' : 'border-slate-200 bg-white'}`}>
                        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                            <Wallet className="h-4 w-4" />{t('admin.costs.budget.title')}
                            {data.monthly_budget_usd > 0 && (
                                <span className={`ml-2 rounded px-2 py-0.5 text-[11px] font-medium ${data.budget_exceeded ? 'bg-rose-200 text-rose-800' : 'bg-emerald-100 text-emerald-700'}`}>
                                    {data.budget_exceeded ? t('admin.costs.budget.exceeded') : t('admin.costs.budget.ok')}
                                </span>
                            )}
                        </div>
                        <div className="flex flex-wrap items-end gap-4">
                            <label className="flex flex-col text-xs font-medium text-slate-500">
                                {t('admin.costs.budget.monthly')}
                                <div className="mt-1 flex gap-1">
                                    <input type="number" min={0} step="1" value={budgetInput} onChange={(e) => setBudgetInput(e.target.value)} className="h-9 w-28 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-sky-400" />
                                    <button type="button" disabled={savingBudget} onClick={() => void saveBudget()} className="inline-flex h-9 items-center rounded-md bg-indigo-600 px-3 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">{t('admin.costs.budget.set')}</button>
                                </div>
                            </label>
                            {data.monthly_budget_usd > 0 && (
                                <>
                                    <div>
                                        <div className="text-xs font-medium text-slate-500">{t('admin.costs.budget.spent')}</div>
                                        <div className="text-lg font-bold text-slate-900">{fmtUsdEur(data.month_to_date_cost, rate)}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-medium text-slate-500">{t('admin.costs.budget.remaining')}</div>
                                        <div className={`text-lg font-bold ${data.budget_remaining < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{fmtUsdEur(data.budget_remaining, rate)}</div>
                                    </div>
                                </>
                            )}
                        </div>
                        {data.monthly_budget_usd > 0 && (
                            <div className="mt-3">
                                <div className="h-3 w-full overflow-hidden rounded bg-slate-100">
                                    <div className={`h-full rounded ${data.budget_exceeded ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, data.budget_used_pct)}%` }} />
                                </div>
                                <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                                    {data.budget_used_pct.toFixed(1)}%
                                    {data.budget_exceeded && (
                                        <span className="ml-2 inline-flex items-center gap-1 font-medium text-rose-600">
                                            <AlertTriangle className="h-3.5 w-3.5" />
                                            {t('admin.costs.budget.fallback')}: ollama / {data.budget_fallback_model}
                                        </span>
                                    )}
                                </p>
                            </div>
                        )}
                        {data.monthly_budget_usd <= 0 && (
                            <p className="mt-2 text-xs text-slate-400">{t('admin.costs.budget.hint')}</p>
                        )}
                    </div>

                    {/* Benchmark vs Production + proiezione articolata */}
                    <div className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded-lg border border-slate-200 bg-white p-4">
                            <h3 className="mb-3 text-sm font-semibold text-slate-700">{t('admin.costs.split')}</h3>
                            <div className="grid grid-cols-2 gap-3">
                                {(['production', 'benchmark'] as const).map((key) => (
                                    <div key={key} className="rounded-md bg-slate-50 p-3">
                                        <div className="text-xs font-medium text-slate-500">{t(`admin.costs.${key}`)}</div>
                                        <div className="mt-1 text-lg font-bold text-slate-900">{fmtCost(data.split[key].cost)}</div>
                                        <div className="text-xs text-slate-400">{fmtInt(data.split[key].turns)} {t('admin.costs.turns').toLowerCase()}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white p-4">
                            <h3 className="mb-3 text-sm font-semibold text-slate-700">{t('admin.costs.projection')}</h3>
                            <div className="flex flex-wrap items-end gap-3">
                                <label className="flex flex-col text-xs font-medium text-slate-500">
                                    {t('admin.costs.estUsers')}
                                    <input type="number" min={0} value={estUsers} onChange={(e) => setEstUsers(e.target.value)} className="mt-1 h-9 w-24 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-sky-400" />
                                </label>
                                <label className="flex flex-col text-xs font-medium text-slate-500">
                                    {t('admin.costs.intPerUser')}
                                    <input type="number" min={0} value={intPerUser} onChange={(e) => setIntPerUser(e.target.value)} className="mt-1 h-9 w-24 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-sky-400" />
                                </label>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-3">
                                <div className="rounded-md bg-slate-50 p-3">
                                    <div className="text-xs font-medium text-slate-500">{t('admin.costs.perMonth')}</div>
                                    <div className={`text-xl font-bold ${data.monthly_budget_usd > 0 && scenario.monthly > data.monthly_budget_usd ? 'text-rose-600' : 'text-emerald-600'}`}>{fmtUsdEur(scenario.monthly, rate)}</div>
                                </div>
                                <div className="rounded-md bg-slate-50 p-3">
                                    <div className="text-xs font-medium text-slate-500">{t('admin.costs.perYear')}</div>
                                    <div className="text-xl font-bold text-emerald-600">{fmtUsdEur(scenario.yearly, rate)}</div>
                                </div>
                            </div>
                            <p className="mt-2 text-xs text-slate-400">
                                {fmtInt(scenario.totalInteractions)} {t('admin.costs.turns').toLowerCase()} · {fmtCost(scenario.costPerInteraction)}/{t('admin.costs.perInteraction')}
                            </p>
                        </div>
                    </div>


                    {/* By model / provider */}
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <h3 className="mb-3 text-sm font-semibold text-slate-700">{t('admin.costs.byModel')}</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                                    <tr>
                                        <th className="px-3 py-2 font-semibold">{t('admin.costs.model')}</th>
                                        <th className="px-3 py-2 font-semibold">{t('admin.costs.provider')}</th>
                                        <th className="px-3 py-2 text-right font-semibold">{t('admin.costs.turns')}</th>
                                        <th className="px-3 py-2 text-right font-semibold">{t('admin.costs.tokensIn')}</th>
                                        <th className="px-3 py-2 text-right font-semibold">{t('admin.costs.tokensOut')}</th>
                                        <th className="px-3 py-2 text-right font-semibold">{t('admin.costs.avgPerTurn')}</th>
                                        <th className="px-3 py-2 text-right font-semibold">{t('admin.costs.cost')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {data.by_model.map((row) => (
                                        <tr key={row.model}>
                                            <td className="px-3 py-2 font-medium text-slate-800">{row.model}</td>
                                            <td className="px-3 py-2 text-slate-500">{row.provider}</td>
                                            <td className="px-3 py-2 text-right text-slate-600">{fmtInt(row.turns)}</td>
                                            <td className="px-3 py-2 text-right text-slate-600">{fmtInt(row.prompt_tokens)}</td>
                                            <td className="px-3 py-2 text-right text-slate-600">{fmtInt(row.completion_tokens)}</td>
                                            <td className="px-3 py-2 text-right text-slate-600">{fmtCost(row.avg_cost_per_turn)}</td>
                                            <td className="px-3 py-2 text-right font-semibold text-slate-900">{fmtCost(row.cost)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* By user */}
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <h3 className="mb-3 text-sm font-semibold text-slate-700">{t('admin.costs.byUser')}</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
                                    <tr>
                                        <th className="px-3 py-2 font-semibold">{t('admin.costs.code')}</th>
                                        <th className="px-3 py-2 text-right font-semibold">{t('admin.costs.sessions')}</th>
                                        <th className="px-3 py-2 text-right font-semibold">{t('admin.costs.turns')}</th>
                                        <th className="px-3 py-2 text-right font-semibold">{t('admin.costs.avgPerTurn')}</th>
                                        <th className="px-3 py-2 text-right font-semibold">{t('admin.costs.cost')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {data.by_user.map((row) => (
                                        <tr key={row.anonymous_research_code}>
                                            <td className="px-3 py-2 font-mono text-xs text-slate-700">{row.anonymous_research_code}</td>
                                            <td className="px-3 py-2 text-right text-slate-600">{fmtInt(row.sessions)}</td>
                                            <td className="px-3 py-2 text-right text-slate-600">{fmtInt(row.turns)}</td>
                                            <td className="px-3 py-2 text-right text-slate-600">{fmtCost(row.avg_cost_per_turn)}</td>
                                            <td className="px-3 py-2 text-right font-semibold text-slate-900">{fmtCost(row.cost)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Daily trend */}
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <h3 className="mb-3 text-sm font-semibold text-slate-700">{t('admin.costs.byDay')}</h3>
                        <div className="space-y-1">
                            {data.by_day.map((row) => (
                                <div key={row.date} className="flex items-center gap-3 text-xs">
                                    <span className="w-24 shrink-0 text-slate-500">{row.date}</span>
                                    <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
                                        <div className="h-full rounded bg-sky-400" style={{ width: maxDayCost > 0 ? `${Math.max(2, (row.cost / maxDayCost) * 100)}%` : '0%' }} />
                                    </div>
                                    <span className="w-24 shrink-0 text-right font-medium text-slate-700">{fmtCost(row.cost)}</span>
                                    <span className="w-16 shrink-0 text-right text-slate-400">{fmtInt(row.turns)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
