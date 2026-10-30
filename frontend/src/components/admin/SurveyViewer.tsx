'use client';

import { useState, useEffect, Fragment } from 'react';
import { RefreshCw, Trash2, BarChart3, TrendingUp, Users, Activity } from 'lucide-react';
import { format } from 'date-fns';
import dynamic from 'next/dynamic';
import { useI18n } from '@/lib/i18n-context';
import { ConfirmInline } from '@/components/ui/ConfirmInline';
// Dynamically import Plotly for client-side rendering only
// Plotly non legge le variabili CSS: un solo tratto sottile nel petrol del marchio
// (--brand) per tutte le dimensioni, invece di dieci tinte diverse.
const VIOLIN_COLOR = '#155e63';

const Plot = dynamic(() => import('react-plotly.js'), { ssr: false });

interface SurveyResponse {
    id: number;
    submitted_at: string;
    eta?: string;
    sesso?: string;
    istruzione?: string;
    tipo_istituto?: string;
    provenienza?: string;
    area_studio?: string;
    paese?: string;
    q_utile?: number;
    q_pertinente?: number;
    q_chiaro?: number;
    q_dettaglio?: number;
    q_facile?: number;
    q_veloce?: number;
    q_fiducia?: number;
    q_riflettere?: number;
    q_coinvolgente?: number;
    q_consiglierei?: number;
    strumenti_utilizzati?: string[] | string;
    counselor_utilizzato?: string;
    feedback_aperto?: string;
}

export function SurveyViewer() {
    const { t } = useI18n();
    const [surveys, setSurveys] = useState<SurveyResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedSurvey, setExpandedSurvey] = useState<number | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

    const fetchSurveys = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/surveys`);
            if (res.ok) {
                const data = await res.json();
                setSurveys(data);
            } else {
                if (res.status === 401 || res.status === 403) {
                    window.location.href = '/';
                }
                console.error('Failed to fetch surveys:', res.statusText);
            }
        } catch (error) {
            console.error('Failed to fetch surveys', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSurveys();
    }, []);

    const handleDelete = async (id: number) => {
        setConfirmDeleteId(null);

        try {
            const res = await fetch(`/api/admin/survey/${id}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                setSurveys(prev => prev.filter(s => s.id !== id));
            }
        } catch (error) {
            console.error('Failed to delete survey', error);
        }
    };

    const renderRating = (value?: number) => {
        if (value === undefined || value === null) return <span className="text-ink-muted">-</span>;
        return (
            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold ${value >= 4 ? 'bg-success-soft text-success' :
                value === 3 ? 'bg-warning-soft text-warning' : 'bg-danger-soft text-danger'
                }`}>
                {value}
            </span>
        );
    };

    const renderTools = (value?: string[] | string) => {
        const tools = Array.isArray(value) ? value : value ? [value] : [];
        if (tools.length === 0) return <span className="text-ink-muted">-</span>;
        return (
            <div className="flex flex-wrap gap-2">
                {tools.map((tool) => (
                    <span
                        key={tool}
                        className="inline-flex px-2 py-1 rounded-full bg-brand-soft text-link text-xs font-semibold"
                    >
                        {t(`survey.tool.${tool}`)}
                    </span>
                ))}
            </div>
        );
    };

    // --- Statistics Calculation ---
    const calculateStats = () => {
        if (surveys.length === 0) return { metrics: [], keyMetrics: { total: 0, overallAvg: '0', avgStdDev: '0' } };

        const fields: (keyof SurveyResponse)[] = [
            'q_utile', 'q_pertinente', 'q_chiaro', 'q_dettaglio',
            'q_facile', 'q_veloce', 'q_fiducia', 'q_riflettere',
            'q_coinvolgente', 'q_consiglierei'
        ];

        const fieldMetadata: Record<string, { label: string }> = {
            'q_utile': { label: t('admin.surveys.m.utile') },
            'q_pertinente': { label: t('admin.surveys.m.pertinente') },
            'q_chiaro': { label: t('admin.surveys.m.chiaro') },
            'q_dettaglio': { label: t('admin.surveys.m.dettaglio') },
            'q_facile': { label: t('admin.surveys.m.facile') },
            'q_veloce': { label: t('admin.surveys.m.veloce') },
            'q_fiducia': { label: t('admin.surveys.m.fiducia') },
            'q_riflettere': { label: t('admin.surveys.m.riflettere') },
            'q_coinvolgente': { label: t('admin.surveys.m.coinvolgente') },
            'q_consiglierei': { label: t('admin.surveys.m.consiglierei') }
        };

        let totalSum = 0;
        let totalCount = 0;
        let stdDevSum = 0;
        let stdDevCount = 0;

        const metrics = fields.map(field => {
            const validValues = surveys
                .map(s => s[field])
                .filter((v): v is number => typeof v === 'number');

            const count = validValues.length;
            const sum = validValues.reduce((a, b) => a + b, 0);
            const avg = count ? sum / count : 0;

            // Standard Deviation
            const variance = count > 1
                ? validValues.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / count
                : 0;
            const stdDev = Math.sqrt(variance);

            totalSum += sum;
            totalCount += count;

            if (count > 0) {
                stdDevSum += stdDev;
                stdDevCount++;
            }

            const meta = fieldMetadata[field as string];

            return {
                id: field,
                name: meta.label,
                value: parseFloat(avg.toFixed(2)),
                stdDev: parseFloat(stdDev.toFixed(2)),
                data: validValues
            };
        });

        const overallAvg = totalCount ? (totalSum / totalCount).toFixed(2) : '0';
        const avgStdDev = stdDevCount ? (stdDevSum / stdDevCount).toFixed(2) : '0';

        return {
            metrics,
            keyMetrics: {
                total: surveys.length,
                overallAvg,
                avgStdDev
            }
        };
    };

    const stats = calculateStats();

    return (
        <div className="space-y-8">
            {/* Statistics Dashboard */}
            {surveys.length > 0 && (
                <div className="space-y-8 animate-fade-in-up">
                    {/* Key Metrics Cards */}
                    <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-surface p-4 rounded-lg border border-line shadow-card flex items-center gap-4">
                            <div className="p-4 bg-brand-soft text-brand rounded-control">
                                <Users className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm text-ink-muted font-semibold">{t('admin.surveys.totalResponses')}</p>
                                <h4 className="text-2xl font-semibold text-ink">{stats.keyMetrics.total}</h4>
                            </div>
                        </div>
                        <div className="bg-surface p-4 rounded-lg border border-line shadow-card flex items-center gap-4">
                            <div className="p-4 bg-success-soft text-success rounded-lg">
                                <TrendingUp className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm text-ink-muted font-semibold">{t('admin.surveys.overallAvg')}</p>
                                <h4 className="text-2xl font-semibold text-ink">{stats.keyMetrics.overallAvg}/5</h4>
                            </div>
                        </div>
                        <div className="bg-surface p-4 rounded-lg border border-line shadow-card flex items-center gap-4">
                            <div className="p-4 bg-brand-soft text-brand rounded-control">
                                <Activity className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm text-ink-muted font-semibold">{t('admin.surveys.avgStdDev')}</p>
                                <h4 className="text-2xl font-semibold text-ink">{stats.keyMetrics.avgStdDev}</h4>
                            </div>
                        </div>
                    </div>

                    {/* Detailed Metric Grid */}
                    <div>
                        <h4 className="text-sm font-semibold text-ink-muted mb-6 flex items-center gap-2">
                            <BarChart3 className="w-4 h-4" /> {t('admin.surveys.dimensionalAnalysis')}
                        </h4>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {stats.metrics.map((metric) => (
                                <div key={metric.id} className="bg-surface rounded-lg border border-line shadow-card overflow-hidden flex flex-col">
                                    <div className="px-4 py-4 border-b border-line bg-surface-sunken flex justify-between items-center">
                                        <h5 className="font-semibold text-ink-body">{metric.name}</h5>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-xl font-semibold text-ink">{metric.value}</span>
                                            <span className="text-xs text-ink-muted">±{metric.stdDev}</span>
                                        </div>
                                    </div>
                                    <div className="h-[200px] w-full p-2">
                                        <Plot
                                            data={[{
                                                type: 'violin',
                                                y: metric.data,
                                                box: { visible: true },
                                                line: { color: VIOLIN_COLOR, width: 1 },
                                                meanline: { visible: true },
                                                points: 'all',
                                                jitter: 0.5,
                                                pointpos: -1.8,
                                                hoverinfo: 'y'
                                            }]}
                                            layout={{
                                                autosize: true,
                                                margin: { t: 10, b: 20, l: 30, r: 10 },
                                                showlegend: false,
                                                yaxis: { range: [0, 6], fixedrange: true },
                                                xaxis: { showticklabels: false, fixedrange: true },
                                                hovermode: 'closest'
                                            }}
                                            style={{ width: '100%', height: '100%' }}
                                            config={{ responsive: true, displayModeBar: false }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-ink">{t('admin.surveys.detailTitle')}</h3>
                <button
                    onClick={fetchSurveys}
                    className="inline-flex items-center justify-center min-h-control min-w-control p-2 hover:bg-surface-raised rounded-lg text-ink-muted hover:text-ink transition-colors"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="bg-surface rounded-lg border border-line overflow-hidden shadow-card">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-surface-sunken text-ink-muted border-b border-line">
                            <tr>
                                <th className="px-4 py-4 font-semibold">{t('admin.surveys.col.date')}</th>
                                <th className="px-4 py-4 font-semibold">{t('admin.surveys.col.user')}</th>
                                <th className="px-4 py-4 font-semibold">{t('admin.surveys.col.avgRating')}</th>
                                <th className="px-4 py-4 font-semibold">{t('admin.surveys.det.openFeedback')}</th>
                                <th className="px-4 py-4 font-semibold text-right">{t('admin.surveys.col.actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                            {surveys.map((survey) => {
                                const ratings = [
                                    survey.q_utile, survey.q_pertinente, survey.q_chiaro,
                                    survey.q_dettaglio, survey.q_facile, survey.q_veloce,
                                    survey.q_fiducia, survey.q_riflettere, survey.q_coinvolgente,
                                    survey.q_consiglierei
                                ].filter(v => v !== undefined && v !== null) as number[];
                                const avgRating = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : '-';

                                return (
                                    <Fragment key={survey.id}>
                                        <tr
                                            className="hover:bg-surface-sunken transition-colors cursor-pointer"
                                            onClick={() => setExpandedSurvey(expandedSurvey === survey.id ? null : survey.id)}
                                        >
                                            <td className="px-4 py-4 text-ink-muted whitespace-nowrap text-xs">
                                                {format(new Date(survey.submitted_at), 'dd/MM/yyyy HH:mm')}
                                            </td>
                                            <td className="px-4 py-4 text-ink-muted text-xs">
                                                <div className="font-semibold text-ink">{survey.sesso || '-'}, {survey.eta || '-'}</div>
                                                <div className="text-ink-muted">{survey.istruzione || '-'}</div>
                                            </td>
                                            <td className="px-4 py-4">
                                                <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-full text-xs font-semibold bg-brand-soft text-link`}>
                                                    {t('admin.surveys.rating')}: {avgRating}/5
                                                </span>
                                            </td>
                                            <td className="px-4 py-4 text-ink-muted text-xs max-w-md">
                                                {survey.feedback_aperto ? (
                                                    <span className="block whitespace-pre-wrap break-words text-ink-body">
                                                        {survey.feedback_aperto}
                                                    </span>
                                                ) : (
                                                    <span className="italic text-ink-muted">{t('admin.surveys.det.noOpenFeedback')}</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-4 text-right">
                                                {confirmDeleteId === survey.id ? (
                                                    <span onClick={(e) => e.stopPropagation()}>
                                                        <ConfirmInline
                                                            question={t('admin.surveys.confirmDelete')}
                                                            onConfirm={() => void handleDelete(survey.id)}
                                                            onCancel={() => setConfirmDeleteId(null)}
                                                        />
                                                    </span>
                                                ) : (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(survey.id); }}
                                                        className="min-h-control min-w-control inline-flex items-center justify-center hover:bg-danger-soft text-ink-muted hover:text-danger rounded-control transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                        {expandedSurvey === survey.id && (
                                            <tr className="bg-surface-sunken/50">
                                                <td colSpan={5} className="px-4 py-4">
                                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
                                                        <div><span className="text-ink-muted block mb-1">{t('admin.surveys.m.utile')}</span>{renderRating(survey.q_utile)}</div>
                                                        <div><span className="text-ink-muted block mb-1">{t('admin.surveys.m.pertinente')}</span>{renderRating(survey.q_pertinente)}</div>
                                                        <div><span className="text-ink-muted block mb-1">{t('admin.surveys.m.chiaro')}</span>{renderRating(survey.q_chiaro)}</div>
                                                        <div><span className="text-ink-muted block mb-1">{t('admin.surveys.m.dettaglio')}</span>{renderRating(survey.q_dettaglio)}</div>
                                                        <div><span className="text-ink-muted block mb-1">{t('admin.surveys.m.facile')}</span>{renderRating(survey.q_facile)}</div>
                                                        <div><span className="text-ink-muted block mb-1">{t('admin.surveys.m.veloce')}</span>{renderRating(survey.q_veloce)}</div>
                                                        <div><span className="text-ink-muted block mb-1">{t('admin.surveys.m.fiducia')}</span>{renderRating(survey.q_fiducia)}</div>
                                                        <div><span className="text-ink-muted block mb-1">{t('admin.surveys.m.riflettere')}</span>{renderRating(survey.q_riflettere)}</div>
                                                        <div><span className="text-ink-muted block mb-1">{t('admin.surveys.m.coinvolgente')}</span>{renderRating(survey.q_coinvolgente)}</div>
                                                        <div><span className="text-ink-muted block mb-1">{t('admin.surveys.m.consiglierei')}</span>{renderRating(survey.q_consiglierei)}</div>

                                                        <div className="col-span-2 md:col-span-5 mt-4 pt-4 border-t border-line">
                                                            <div className="grid md:grid-cols-3 gap-4">
                                                                <div>
                                                                    <span className="text-ink-muted block mb-1">{t('admin.surveys.det.istituto')}</span>
                                                                    <span className="font-semibold text-ink-body">{survey.tipo_istituto || '-'}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-ink-muted block mb-1">{t('admin.surveys.det.provenienza')}</span>
                                                                    <span className="font-semibold text-ink-body">{survey.provenienza || '-'}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-ink-muted block mb-1">{t('admin.surveys.det.area')}</span>
                                                                    <span className="font-semibold text-ink-body">{survey.area_studio || '-'}</span>
                                                                </div>
                                                            </div>
                                                            {survey.paese && (
                                                                <div className="mt-4 grid md:grid-cols-3 gap-4">
                                                                    <div>
                                                                        <span className="text-ink-muted block mb-1">{t('admin.surveys.det.paese')}</span>
                                                                        <span className="font-semibold text-ink-body">{survey.paese}</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="col-span-2 md:col-span-5 mt-4 pt-4 border-t border-line">
                                                            <div className="grid md:grid-cols-2 gap-4">
                                                                <div>
                                                                    <span className="text-ink-muted block mb-1">{t('admin.surveys.det.tools')}</span>
                                                                    {renderTools(survey.strumenti_utilizzati)}
                                                                    <span className="text-ink-muted block mb-1 mt-4">{t('admin.surveys.det.counselor')}</span>
                                                                    {survey.counselor_utilizzato ? (
                                                                        <span className="inline-flex px-2 py-1 rounded-full bg-brand-soft text-link text-xs font-semibold">
                                                                            {survey.counselor_utilizzato}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-ink-muted">-</span>
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <span className="text-ink-muted block mb-1">{t('admin.surveys.det.openFeedback')}</span>
                                                                    {survey.feedback_aperto ? (
                                                                        <p className="font-semibold text-ink-body whitespace-pre-wrap">{survey.feedback_aperto}</p>
                                                                    ) : (
                                                                        <span className="italic text-ink-muted">{t('admin.surveys.det.noOpenFeedback')}</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                );
                            })}

                            {surveys.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-ink-muted">
                                        {t('admin.surveys.empty')}
                                    </td>
                                </tr>
                            )}
                            {loading && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-ink-muted">
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
