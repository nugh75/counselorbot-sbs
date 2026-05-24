'use client';

import { useState, useEffect, useMemo, Fragment } from 'react';
import { RefreshCw, FileText, Filter, Download } from 'lucide-react';
import { format } from 'date-fns';
import { useI18n } from '@/lib/i18n-context';
import { QUESTIONNAIRES, QuestionnaireType, FactorDefinition } from '@/lib/questionnaires';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList, ErrorBar
} from 'recharts';

interface QuestionnaireResult {
    id: number;
    session_id: string;
    questionnaire_type: string;
    scores: Record<string, number> | null;
    submitted_at: string;
}

interface FactorStats {
    code: string;
    name: string;
    mean: number;
    stdDev: number;
    min: number;
    max: number;
    count: number;
    strengthPct: number;
    normalPct: number;
    growthPct: number;
    inverted: boolean;
    meanColor: string;
}

interface TypeStats {
    type: string;
    factors: FactorStats[];
}

const QUESTIONNAIRE_TYPES = ['QSA', 'QSAr', 'ZTPI', 'SAVICKAS'];

function getFactorName(code: string, questionnaireType: string): string {
    const q = QUESTIONNAIRES[questionnaireType as QuestionnaireType];
    if (!q) return code;
    const factor = q.factors.find((f: FactorDefinition) => f.code === code);
    return factor ? `${code} (${factor.name})` : code;
}

function getFactorDescription(code: string, questionnaireType: string): string {
    const q = QUESTIONNAIRES[questionnaireType as QuestionnaireType];
    if (!q) return '';
    const factor = q.factors.find((f: FactorDefinition) => f.code === code);
    return factor?.description || '';
}

function isInverted(code: string, questionnaireType: string): boolean {
    const q = QUESTIONNAIRES[questionnaireType as QuestionnaireType];
    if (!q) return false;
    return q.invertedFactors.includes(code);
}

function ScoreBadge({ value, code, questionnaireType }: { value: number; code: string; questionnaireType: string }) {
    const inverted = isInverted(code, questionnaireType);
    const isStrength = inverted ? value <= 3 : value >= 7;
    const isGrowth = inverted ? value >= 7 : value <= 3;

    let color: string;
    if (isStrength) color = 'bg-green-100 text-green-700';
    else if (isGrowth) color = 'bg-red-100 text-red-700';
    else color = 'bg-yellow-100 text-yellow-700';

    return (
        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-xs font-bold ${color}`}
              title={inverted ? 'Fattore invertito' : ''}>
            {value}
        </span>
    );
}

export function QuestionnaireResultsViewer() {
    const { t } = useI18n();
    const [results, setResults] = useState<QuestionnaireResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [filterType, setFilterType] = useState<string>('');

    const fetchResults = async (type?: string) => {
        setLoading(true);
        try {
            let url = '/api/admin/questionnaire-results';
            const params = new URLSearchParams();
            if (type) params.set('questionnaire_type', type);
            const qs = params.toString();
            if (qs) url += '?' + qs;

            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setResults(data);
            } else {
                if (res.status === 401 || res.status === 403) {
                    window.location.href = '/';
                }
                console.error('Failed to fetch results:', res.statusText);
            }
        } catch (error) {
            console.error('Failed to fetch results', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchResults(filterType || undefined);
    }, [filterType]);

    const handleFilterChange = (type: string) => {
        setFilterType(type);
        setExpandedId(null);
    };

    const handleExportCsv = () => {
        const allCodes = new Set<string>();
        results.forEach(r => {
            if (r.scores) Object.keys(r.scores).forEach(code => allCodes.add(code));
        });
        const sortedCodes = Array.from(allCodes).sort();

        const headers = ['id', 'date', 'session_id', 'questionnaire_type', ...sortedCodes];
        const rows = results.map(r => {
            const date = format(new Date(r.submitted_at), 'yyyy-MM-dd HH:mm');
            const scores = sortedCodes.map(code => r.scores?.[code] ?? '');
            return [r.id, date, r.session_id, r.questionnaire_type, ...scores];
        });

        const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `questionnaire-results-${format(new Date(), 'yyyy-MM-dd')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const getTypeColor = (type: string) => {
        const colors: Record<string, string> = {
            QSA: 'bg-blue-100 text-blue-700',
            QSAr: 'bg-sky-100 text-sky-700',
            ZTPI: 'bg-amber-100 text-amber-700',
            SAVICKAS: 'bg-emerald-100 text-emerald-700',
        };
        return colors[type] || 'bg-slate-100 text-slate-700';
    };

    const typeStatsList = useMemo<TypeStats[]>(() => {
        const byType: Record<string, QuestionnaireResult[]> = {};
        results.forEach(r => {
            if (!r.scores || Object.keys(r.scores).length === 0) return;
            if (!byType[r.questionnaire_type]) byType[r.questionnaire_type] = [];
            byType[r.questionnaire_type].push(r);
        });

        const result: TypeStats[] = [];

        for (const [type, typeResults] of Object.entries(byType)) {
            const factorCodes = new Set<string>();
            typeResults.forEach(r => {
                if (r.scores) Object.keys(r.scores).forEach(code => factorCodes.add(code));
            });

            const factors: FactorStats[] = [];
            for (const code of factorCodes) {
                const values = typeResults
                    .map(r => r.scores?.[code])
                    .filter((v): v is number => v !== undefined && v !== null);

                if (values.length === 0) continue;

                const total = values.length;
                const sum = values.reduce((a, b) => a + b, 0);
                const mean = sum / total;
                const squaredDiffs = values.map(v => (v - mean) ** 2);
                const variance = squaredDiffs.reduce((a, b) => a + b, 0) / Math.max(total - 1, 1);
                const stdDev = Math.sqrt(variance);
                const min = Math.min(...values);
                const max = Math.max(...values);

                const inverted = isInverted(code, type);
                const strengthCount = values.filter(v => inverted ? v <= 3 : v >= 7).length;
                const growthCount = values.filter(v => inverted ? v >= 7 : v <= 3).length;
                const normalCount = total - strengthCount - growthCount;

                const isStrength = inverted ? mean <= 3 : mean >= 7;
                const isGrowth = inverted ? mean >= 7 : mean <= 3;
                let meanColor: string;
                if (isStrength) meanColor = '#16a34a';
                else if (isGrowth) meanColor = '#dc2626';
                else meanColor = '#ca8a04';

                const q = QUESTIONNAIRES[type as QuestionnaireType];
                const factorDef = q?.factors.find((f: FactorDefinition) => f.code === code);

                factors.push({
                    code,
                    name: factorDef?.name || code,
                    mean: Math.round(mean * 100) / 100,
                    stdDev: Math.round(stdDev * 100) / 100,
                    min,
                    max,
                    count: total,
                    strengthPct: Math.round((strengthCount / total) * 1000) / 10,
                    normalPct: Math.round((normalCount / total) * 1000) / 10,
                    growthPct: Math.round((growthCount / total) * 1000) / 10,
                    inverted,
                    meanColor,
                });
            }

            if (factors.length > 0) {
                result.push({ type, factors });
            }
        }

        return result;
    }, [results]);

    const totalResults = results.length;
    const typeCounts: Record<string, number> = {};
    results.forEach(r => {
        typeCounts[r.questionnaire_type] = (typeCounts[r.questionnaire_type] || 0) + 1;
    });

    return (
        <div className="space-y-6">
            {/* Stats */}
            {results.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center gap-4">
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-md">
                            <FileText className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm text-slate-500 font-medium">{t('admin.results.total')}</p>
                            <h4 className="text-2xl font-bold text-slate-800">{totalResults}</h4>
                        </div>
                    </div>
                    {QUESTIONNAIRE_TYPES.map(type => (
                        <div key={type} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex items-center gap-4">
                            <div className={`p-3 rounded-md ${getTypeColor(type)}`}>
                                <span className="text-xs font-bold">{type}</span>
                            </div>
                            <div>
                                <p className="text-sm text-slate-500 font-medium">{type}</p>
                                <h4 className="text-2xl font-bold text-slate-800">{typeCounts[type] || 0}</h4>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Filter */}
            <div className="flex items-center gap-3">
                <Filter className="w-4 h-4 text-slate-400" />
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => handleFilterChange('')}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                            !filterType
                                ? 'bg-indigo-50 border-indigo-100 text-indigo-600'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                        {t('admin.results.all')}
                    </button>
                    {QUESTIONNAIRE_TYPES.map(type => (
                        <button
                            key={type}
                            onClick={() => handleFilterChange(type)}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                                filterType === type
                                    ? 'bg-indigo-50 border-indigo-100 text-indigo-600'
                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            {type}
                        </button>
                    ))}
                </div>
                <div className="ml-auto flex items-center gap-1">
                    <button
                        onClick={handleExportCsv}
                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700 transition-colors"
                        title={t('admin.results.csv')}
                    >
                        <Download className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => fetchResults(filterType || undefined)}
                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700 transition-colors"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Distribution & Stats per questionnaire type */}
            {typeStatsList.map(({ type, factors }) => {
                const chartData = factors.map(f => ({
                    factor: f.code,
                    factorName: getFactorName(f.code, type),
                    mean: f.mean,
                    stdDev: f.stdDev,
                    min: f.min,
                    max: f.max,
                    count: f.count,
                    fill: f.meanColor,
                }));

                return (
                    <div key={type} className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
                            <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getTypeColor(type)}`}>
                                {type}
                            </span>
                            <h3 className="text-sm font-semibold text-slate-700">{t('admin.results.stats')}</h3>
                        </div>
                        <div className="p-4">
                            <ResponsiveContainer width="100%" height={280}>
                                <BarChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="factor" tick={{ fontSize: 12 }} />
                                    <YAxis domain={[0, 9]} ticks={[1, 3, 5, 7, 9]} />
                                    <Tooltip content={(p: { active?: boolean; payload?: readonly { payload: Record<string, unknown> }[] }) => {
                                        if (!p.active || !p.payload?.length) return null;
                                        const d = p.payload[0].payload;
                                        return (
                                            <div className="bg-white border border-slate-200 shadow-md rounded-lg p-3 text-xs">
                                                <p className="font-semibold text-slate-700 mb-1">{d.factorName as string}</p>
                                                <div className="space-y-0.5 text-slate-600">
                                                    <p>{t('admin.results.mean')}: {(d.mean as number).toFixed(2)}</p>
                                                    <p>{t('admin.results.stddev')}: {(d.stdDev as number).toFixed(2)}</p>
                                                    <p>{t('admin.results.min')}: {d.min as number}</p>
                                                    <p>{t('admin.results.max')}: {d.max as number}</p>
                                                    <p>{t('admin.results.count')}: {d.count as number}</p>
                                                </div>
                                            </div>
                                        );
                                    }}
                                    />
                                    <Bar dataKey="mean" isAnimationActive={false}>
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))}
                                        <LabelList
                                            dataKey="mean"
                                            position="top"
                                            formatter={(v: unknown) => typeof v === 'number' ? v.toFixed(1) : String(v)}
                                            style={{ fontSize: '11px', fill: '#666' }}
                                        />
                                        <ErrorBar dataKey="stdDev" width={4} strokeWidth={2} stroke="#666" />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="border-t border-slate-100">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                                        <tr>
                                            <th className="px-4 py-2.5 font-medium text-xs">{t('admin.results.factor')}</th>
                                            <th className="px-4 py-2.5 font-medium text-xs">{t('admin.results.count')}</th>
                                            <th className="px-4 py-2.5 font-medium text-xs">{t('admin.results.mean')}</th>
                                            <th className="px-4 py-2.5 font-medium text-xs">{t('admin.results.stddev')}</th>
                                            <th className="px-4 py-2.5 font-medium text-xs">{t('admin.results.min')}</th>
                                            <th className="px-4 py-2.5 font-medium text-xs">{t('admin.results.max')}</th>
                                            <th className="px-4 py-2.5 font-medium text-xs">{t('admin.results.pctStrength')}</th>
                                            <th className="px-4 py-2.5 font-medium text-xs">{t('admin.results.pctNormal')}</th>
                                            <th className="px-4 py-2.5 font-medium text-xs">{t('admin.results.pctGrowth')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {factors.map(f => (
                                            <tr key={f.code} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-4 py-2.5 text-xs font-medium text-slate-700">
                                                    {getFactorName(f.code, type)}
                                                </td>
                                                <td className="px-4 py-2.5 text-xs text-slate-600">{f.count}</td>
                                                <td className="px-4 py-2.5 text-xs text-slate-600">{f.mean.toFixed(2)}</td>
                                                <td className="px-4 py-2.5 text-xs text-slate-600">{f.stdDev.toFixed(2)}</td>
                                                <td className="px-4 py-2.5 text-xs text-slate-600">{f.min}</td>
                                                <td className="px-4 py-2.5 text-xs text-slate-600">{f.max}</td>
                                                <td className="px-4 py-2.5 text-xs text-slate-600">{f.strengthPct}%</td>
                                                <td className="px-4 py-2.5 text-xs text-slate-600">{f.normalPct}%</td>
                                                <td className="px-4 py-2.5 text-xs text-slate-600">{f.growthPct}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                );
            })}

            {/* Table */}
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3 font-medium">{t('admin.results.col.date')}</th>
                                <th className="px-4 py-3 font-medium">{t('admin.results.col.type')}</th>
                                <th className="px-4 py-3 font-medium">{t('admin.results.col.session')}</th>
                                <th className="px-4 py-3 font-medium">{t('admin.results.col.factors')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {results.map((result) => {
                                const scoreKeys = result.scores ? Object.keys(result.scores) : [];
                                return (
                                    <Fragment key={result.id}>
                                        <tr
                                            className="hover:bg-slate-50 transition-colors cursor-pointer"
                                            onClick={() => setExpandedId(expandedId === result.id ? null : result.id)}
                                        >
                                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">
                                                {format(new Date(result.submitted_at), 'dd/MM/yyyy HH:mm')}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${getTypeColor(result.questionnaire_type)}`}>
                                                    {result.questionnaire_type}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                                                {result.session_id.substring(0, 8)}…
                                            </td>
                                            <td className="px-4 py-3">
                                                {result.questionnaire_type === 'SAVICKAS' ? (
                                                    <span className="text-xs text-slate-400 italic">{t('admin.results.qualitative')}</span>
                                                ) : scoreKeys.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {scoreKeys.slice(0, 6).map(key => (
                                                            <ScoreBadge
                                                                key={key}
                                                                code={key}
                                                                value={result.scores![key]}
                                                                questionnaireType={result.questionnaire_type}
                                                            />
                                                        ))}
                                                        {scoreKeys.length > 6 && (
                                                            <span className="text-xs text-slate-400">+{scoreKeys.length - 6}</span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-slate-400">-</span>
                                                )}
                                            </td>
                                        </tr>
                                        {expandedId === result.id && (
                                            <tr className="bg-slate-50/50">
                                                <td colSpan={4} className="px-4 py-4">
                                                    <div className="text-xs space-y-2">
                                                        <div className="flex items-center gap-2 text-slate-500 mb-3">
                                                            <span className="font-mono">{t('admin.results.sessionFull')}: {result.session_id}</span>
                                                        </div>
                                                        {result.questionnaire_type === 'SAVICKAS' ? (
                                                            <p className="text-slate-500 italic">{t('admin.results.qualitativeDesc')}</p>
                                                        ) : result.scores ? (
                                                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                                                {Object.entries(result.scores).map(([code, value]) => {
                                                                    const inverted = isInverted(code, result.questionnaire_type);
                                                                    const name = getFactorName(code, result.questionnaire_type);
                                                                    const desc = getFactorDescription(code, result.questionnaire_type);
                                                                    const isStrength = inverted ? value <= 3 : value >= 7;
                                                                    const isGrowth = inverted ? value >= 7 : value <= 3;
                                                                    let badgeClass: string;
                                                                    if (isStrength) badgeClass = 'border-green-300 bg-green-50';
                                                                    else if (isGrowth) badgeClass = 'border-red-300 bg-red-50';
                                                                    else badgeClass = 'border-yellow-300 bg-yellow-50';

                                                                    return (
                                                                        <div key={code} className={`p-2 rounded border ${badgeClass}`}>
                                                                            <div className="font-semibold text-slate-700">{name}</div>
                                                                            {desc && <div className="text-slate-400 mt-0.5">{desc}</div>}
                                                                            <div className="flex items-center gap-1.5 mt-1">
                                                                                <span className="text-lg font-bold">{value}</span>
                                                                                <span className="text-xs text-slate-400">/9</span>
                                                                                {inverted && <span className="text-xs text-slate-400">(inv.)</span>}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : (
                                                            <p className="text-slate-400">{t('admin.results.noScores')}</p>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}
                            {results.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                                        {t('admin.results.empty')}
                                    </td>
                                </tr>
                            )}
                            {loading && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                                        <RefreshCw className="w-5 h-5 animate-spin mx-auto" />
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
