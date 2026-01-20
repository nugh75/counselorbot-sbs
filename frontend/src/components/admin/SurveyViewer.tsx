'use client';

import { useState, useEffect, Fragment } from 'react';
import { RefreshCw, Trash2, FileText, CheckCircle, BarChart3, TrendingUp, Users, Activity } from 'lucide-react';
import { format } from 'date-fns';
import dynamic from 'next/dynamic';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Radar
} from 'recharts';

// Dynamically import Plotly for client-side rendering only
const Plot = dynamic(() => import('react-plotly.js'), { ssr: false }) as any;

interface SurveyResponse {
    id: number;
    submitted_at: string;
    eta?: string;
    sesso?: string;
    istruzione?: string;
    tipo_istituto?: string;
    provenienza?: string;
    area_studio?: string;
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
}

export function SurveyViewer() {
    const [surveys, setSurveys] = useState<SurveyResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedSurvey, setExpandedSurvey] = useState<number | null>(null);

    const fetchSurveys = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('http://localhost:8000/admin/surveys', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setSurveys(data);
            } else {
                if (res.status === 401 || res.status === 403) {
                    localStorage.removeItem('token');
                    window.location.href = '/login';
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

    const handleDelete = async (id: number, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Sei sicuro di voler eliminare questo sondaggio?')) return;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`http://localhost:8000/admin/survey/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setSurveys(prev => prev.filter(s => s.id !== id));
            }
        } catch (error) {
            console.error('Failed to delete survey', error);
        }
    };

    const renderRating = (value?: number) => {
        if (value === undefined || value === null) return <span className="text-gray-300">-</span>;
        return (
            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${value >= 4 ? 'bg-green-100 text-green-700' :
                value === 3 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                }`}>
                {value}
            </span>
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

        const fieldMetadata: Record<string, { label: string; color: string; bg: string }> = {
            'q_utile': { label: 'Utile', color: '#3b82f6', bg: 'bg-blue-50' },          // Blue
            'q_pertinente': { label: 'Pertinente', color: '#6366f1', bg: 'bg-indigo-50' }, // Indigo
            'q_chiaro': { label: 'Chiaro', color: '#0ea5e9', bg: 'bg-sky-50' },          // Sky
            'q_dettaglio': { label: 'Dettagliato', color: '#06b6d4', bg: 'bg-cyan-50' },   // Cyan
            'q_facile': { label: 'Facile', color: '#14b8a6', bg: 'bg-teal-50' },          // Teal
            'q_veloce': { label: 'Veloce', color: '#10b981', bg: 'bg-emerald-50' },       // Emerald
            'q_fiducia': { label: 'Fiducia', color: '#22c55e', bg: 'bg-green-50' },       // Green
            'q_riflettere': { label: 'Riflessivo', color: '#84cc16', bg: 'bg-lime-50' },   // Lime
            'q_coinvolgente': { label: 'Coinvolgente', color: '#8b5cf6', bg: 'bg-violet-50' }, // Violet
            'q_consiglierei': { label: 'Consiglierei', color: '#d946ef', bg: 'bg-fuchsia-50' } // Fuchsia
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
                color: meta.color,
                bg: meta.bg,
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
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                            <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
                                <Users className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500 font-medium">Totale Risposte</p>
                                <h4 className="text-2xl font-bold text-slate-800">{stats.keyMetrics.total}</h4>
                            </div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                            <div className="p-3 bg-green-100 text-green-600 rounded-lg">
                                <TrendingUp className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500 font-medium">Media Complessiva</p>
                                <h4 className="text-2xl font-bold text-slate-800">{stats.keyMetrics.overallAvg}/5</h4>
                            </div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                            <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
                                <Activity className="w-6 h-6" />
                            </div>
                            <div>
                                <p className="text-sm text-slate-500 font-medium">Deviazione Std Media</p>
                                <h4 className="text-2xl font-bold text-slate-800">{stats.keyMetrics.avgStdDev}</h4>
                            </div>
                        </div>
                    </div>

                    {/* Detailed Metric Grid */}
                    <div>
                        <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-6 flex items-center gap-2">
                            <BarChart3 className="w-4 h-4" /> Analisi Dimensionale
                        </h4>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {stats.metrics.map((metric) => (
                                <div key={metric.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                                    <div className={`px-4 py-3 border-b border-slate-100 ${metric.bg} flex justify-between items-center`}>
                                        <h5 className="font-semibold text-slate-700">{metric.name}</h5>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-xl font-bold text-slate-800">{metric.value}</span>
                                            <span className="text-xs text-slate-500">±{metric.stdDev}</span>
                                        </div>
                                    </div>
                                    <div className="h-[200px] w-full p-2">
                                        <Plot
                                            data={[{
                                                type: 'violin',
                                                y: metric.data,
                                                box: { visible: true },
                                                line: { color: metric.color },
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
                <h3 className="text-lg font-semibold text-slate-800">Dettaglio Risposte</h3>
                <button
                    onClick={fetchSurveys}
                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700 transition-colors"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3 font-medium">Data</th>
                                <th className="px-4 py-3 font-medium">Utente</th>
                                <th className="px-4 py-3 font-medium">Valutazione Media</th>
                                <th className="px-4 py-3 font-medium text-right">Azioni</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
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
                                            className="hover:bg-slate-50 transition-colors cursor-pointer"
                                            onClick={() => setExpandedSurvey(expandedSurvey === survey.id ? null : survey.id)}
                                        >
                                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">
                                                {format(new Date(survey.submitted_at), 'dd/MM/yyyy HH:mm')}
                                            </td>
                                            <td className="px-4 py-3 text-slate-600 text-xs">
                                                <div className="font-medium text-slate-900">{survey.sesso || '-'}, {survey.eta || '-'}</div>
                                                <div className="text-slate-400">{survey.istruzione || '-'}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700`}>
                                                    Rating: {avgRating}/5
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    onClick={(e) => handleDelete(survey.id, e)}
                                                    className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                        {expandedSurvey === survey.id && (
                                            <tr className="bg-slate-50/50">
                                                <td colSpan={4} className="px-4 py-4">
                                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
                                                        <div><span className="text-slate-400 block mb-1">Utile</span>{renderRating(survey.q_utile)}</div>
                                                        <div><span className="text-slate-400 block mb-1">Pertinente</span>{renderRating(survey.q_pertinente)}</div>
                                                        <div><span className="text-slate-400 block mb-1">Chiaro</span>{renderRating(survey.q_chiaro)}</div>
                                                        <div><span className="text-slate-400 block mb-1">Dettagliato</span>{renderRating(survey.q_dettaglio)}</div>
                                                        <div><span className="text-slate-400 block mb-1">Facile</span>{renderRating(survey.q_facile)}</div>
                                                        <div><span className="text-slate-400 block mb-1">Veloce</span>{renderRating(survey.q_veloce)}</div>
                                                        <div><span className="text-slate-400 block mb-1">Fiducia</span>{renderRating(survey.q_fiducia)}</div>
                                                        <div><span className="text-slate-400 block mb-1">Riflettere</span>{renderRating(survey.q_riflettere)}</div>
                                                        <div><span className="text-slate-400 block mb-1">Coinvolgente</span>{renderRating(survey.q_coinvolgente)}</div>
                                                        <div><span className="text-slate-400 block mb-1">Consiglierei</span>{renderRating(survey.q_consiglierei)}</div>

                                                        <div className="col-span-2 md:col-span-5 mt-4 pt-4 border-t border-slate-200">
                                                            <div className="grid md:grid-cols-3 gap-4">
                                                                <div>
                                                                    <span className="text-slate-400 block mb-1">Istituto</span>
                                                                    <span className="font-medium text-slate-700">{survey.tipo_istituto || '-'}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-slate-400 block mb-1">Provenienza</span>
                                                                    <span className="font-medium text-slate-700">{survey.provenienza || '-'}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="text-slate-400 block mb-1">Area di Studio</span>
                                                                    <span className="font-medium text-slate-700">{survey.area_studio || '-'}</span>
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
                                    <td colSpan={4} className="px-6 py-8 text-center text-slate-400">
                                        Nessun sondaggio trovato.
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
