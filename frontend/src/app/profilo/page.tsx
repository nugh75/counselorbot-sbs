'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n-context';
import { getIdentity, type Identity } from '@/lib/auth';
import { canUsePersonalPage } from '@/lib/roles';
import { useDarkMode } from '@/lib/use-dark-mode';
import { toast } from '@/components/ui/Toast';
import { Skeleton } from '@/components/ui/Skeleton';
import { QUESTIONNAIRES, QuestionnaireType } from '@/lib/questionnaires';
import { addCompletedProfile, clearCompletedProfiles } from '@/lib/profile-tracker';
import { LearnerProfileCard } from '@/components/profile/LearnerProfileCard';
import { ProfileChangeReflection } from '@/components/profile/ProfileChangeReflection';
import { StudentBookletCard } from '@/components/profile/StudentBookletCard';
import {
    ArrowLeft, User, FileText, Trash2, Download, MessageSquare, ShieldAlert, Search
} from 'lucide-react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList,
    type TooltipContentProps,
} from 'recharts';

interface QuestionnaireResult {
    id: number;
    session_id: string;
    questionnaire_type: string;
    scores: Record<string, number> | null;
    submitted_at: string;
}

const BOOKLET_TYPES: QuestionnaireType[] = ['QSA', 'QSAr', 'ZTPI', 'SAVICKAS', 'QPCS', 'QPCC', 'QAP'];

export default function ProfilePage() {
    const { t, tf, lang } = useI18n();
    const isDark = useDarkMode();
    const [identity, setIdentity] = useState<Identity | null>(null);
    const [sessions, setSessions] = useState<QuestionnaireResult[]>([]);
    const [selectedSession, setSelectedSession] = useState<QuestionnaireResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
    const [sessionSearch, setSessionSearch] = useState('');
    const [selectedBookletType, setSelectedBookletType] = useState<QuestionnaireType>('QSA');
    const [activeTab, setActiveTab] = useState<'taccuino' | 'strumenti'>('taccuino');

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const id = await getIdentity();
            if (id?.authenticated) {
                setIdentity(id);
                const res = await fetch('/api/user/questionnaire-results');
                if (res.ok) {
                    const payload: unknown = await res.json();
                    if (Array.isArray(payload)) {
                        const data = payload as QuestionnaireResult[];
                        setSessions(data);
                        setSelectedSession((selected) => (
                            selected
                                ? data.find((session) => session.session_id === selected.session_id) ?? data[0] ?? null
                                : data[0] ?? null
                        ));

                        // Sync localStorage completed profiles
                        clearCompletedProfiles();
                        const sorted = [...data].sort((a, b) =>
                            new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime()
                        );
                        for (const s of sorted) {
                            if (['QSA', 'QSAr', 'ZTPI', 'SAVICKAS', 'QPCS', 'QPCC', 'QAP'].includes(s.questionnaire_type)) {
                                addCompletedProfile(s.questionnaire_type, s.session_id, s.scores || {});
                            }
                        }
                    }
                }
            } else {
                setIdentity(null);
            }
        } catch (e) {
            console.error("Failed to load profile data", e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const handleDelete = async (sessionId: string) => {
        setActionLoading(sessionId);
        try {
            const res = await fetch(`/api/questionnaire-result/${sessionId}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                // Clear local storage reference and reload
                if (selectedSession?.session_id === sessionId) {
                    setSelectedSession(null);
                }
                setShowDeleteConfirm(null);
                await loadData();
                toast.success(t('toast.deleted'));
            } else {
                console.error("Failed to delete session:", res.statusText);
                toast.error(t('toast.error'));
            }
        } catch (e) {
            console.error("Error deleting session", e);
            toast.error(t('toast.error'));
        } finally {
            setActionLoading(null);
        }
    };

    const handleDownloadPdf = async (sessionId: string, type: string) => {
        try {
            const res = await fetch(`/api/questionnaire-result/${sessionId}/pdf?lang=${lang}`);
            if (!res.ok) throw new Error('PDF download failed');
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `counselorbot_${type}_${sessionId.slice(0, 8)}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Failed to download PDF', e);
            toast.error(t('toast.error'));
        }
    };

    const filteredSessions = useMemo(() => {
        const query = sessionSearch.trim().toLowerCase();
        if (!query) return sessions;
        return sessions.filter((session) => {
            const submitted = new Date(session.submitted_at);
            const haystack = [
                session.questionnaire_type,
                session.session_id,
                session.session_id.slice(0, 8),
                submitted.toLocaleDateString(lang),
                submitted.toLocaleString(lang),
            ].join(' ').toLowerCase();
            return haystack.includes(query);
        });
    }, [sessions, sessionSearch, lang]);

    useEffect(() => {
        if (filteredSessions.length === 0) {
            if (selectedSession !== null) setSelectedSession(null);
            return;
        }
        if (!selectedSession || !filteredSessions.some((session) => session.session_id === selectedSession.session_id)) {
            setSelectedSession(filteredSessions[0]);
            setShowDeleteConfirm(null);
        }
    }, [filteredSessions, selectedSession]);

    const formatSessionOption = (session: QuestionnaireResult) => {
        const submitted = new Date(session.submitted_at).toLocaleString(lang);
        return `${submitted} · ${session.questionnaire_type} · ${session.session_id.slice(0, 8)}`;
    };

    // Chart score preparation
    const chartData = useMemo(() => {
        if (!selectedSession || !selectedSession.scores) return [];
        const type = selectedSession.questionnaire_type;
        const scores = selectedSession.scores;
        const config = QUESTIONNAIRES[type as QuestionnaireType];
        if (!config) return [];

        return config.factors.map(f => {
            const val = scores[f.code] ?? 0;
            const inverted = config.invertedFactors.includes(f.code);
            const isStrength = inverted ? val <= 3 : val >= 7;
            const isGrowth = inverted ? val >= 7 : val <= 3;
            
            let color = '#ca8a04'; // yellow-600
            if (isStrength) color = '#16a34a'; // green-600
            else if (isGrowth) color = '#dc2626'; // red-600

            return {
                code: f.code,
                name: tf(`factor.${f.code}.name`, f.name),
                value: val,
                color,
            };
        });
    }, [selectedSession, tf]);

    const getTypeColor = (type: string) => {
        const colors: Record<string, string> = {
            QSA: 'bg-blue-100 text-blue-700 border-blue-200',
            QSAr: 'bg-sky-100 text-sky-700 border-sky-200',
            ZTPI: 'bg-amber-100 text-amber-700 border-amber-200',
            SAVICKAS: 'bg-emerald-100 text-emerald-700 border-emerald-200',
            QPCS: 'bg-violet-100 text-violet-700 border-violet-200',
            QPCC: 'bg-rose-100 text-rose-700 border-rose-200',
            QAP: 'bg-cyan-100 text-cyan-700 border-cyan-200',
        };
        return colors[type] || 'bg-slate-100 text-slate-700 border-slate-200';
    };

    if (loading) {
        return (
            <div className="page-wide px-4 py-8 space-y-8">
                <Skeleton className="h-9 w-64" />
                <Skeleton className="h-24 w-full" />
                <div className="grid lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-1 space-y-3">
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-20 w-full" />
                        <Skeleton className="h-20 w-full" />
                    </div>
                    <div className="lg:col-span-2">
                        <Skeleton className="h-96 w-full" />
                    </div>
                </div>
            </div>
        );
    }

    if (!identity) {
        return (
            <div className="max-w-md mx-auto my-12 p-8 bg-white border border-slate-200 rounded-xl text-center space-y-6 shadow-sm">
                <div className="mx-auto w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center">
                    <User className="w-6 h-6 text-indigo-600" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900">{t('profile.loginRequired')}</h1>
                <p className="text-slate-500 text-sm">
                    {t('profile.loginRequiredDesc')}
                </p>
                <button
                    onClick={() => window.location.href = '/'}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-semibold transition-colors"
                >
                    {t('profile.backToHomeToLogin')}
                </button>
            </div>
        );
    }

    // La pagina personale resta vincolata all'autenticazione: ogni utente vede solo i propri dati.
    if (!canUsePersonalPage(identity)) {
        return (
            <div className="max-w-md mx-auto my-12 p-8 bg-white border border-slate-200 rounded-xl text-center space-y-6 shadow-sm">
                <div className="mx-auto w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center">
                    <ShieldAlert className="w-6 h-6 text-amber-600" />
                </div>
                <h1 className="text-2xl font-bold text-slate-900">{t('profile.restrictedTitle')}</h1>
                <p className="text-slate-500 text-sm">{t('profile.restrictedDesc')}</p>
                <button
                    onClick={() => window.location.href = '/'}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-semibold transition-colors"
                >
                    {t('profile.backToHomeToLogin')}
                </button>
            </div>
        );
    }

    return (
        <div className="page-wide px-4 py-8 space-y-8">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
                        <User className="w-5 h-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">{t('profile.title')}</h1>
                        <p className="text-sm text-slate-500 mt-1">{t('profile.subtitle')}</p>
                    </div>
                </div>
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    {t('nav.home')}
                </Link>
            </div>

            {/* Account Info Details Card */}
            <section className="glass-panel p-6 flex flex-wrap items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-lg">
                        {identity.username?.slice(0, 2).toUpperCase() || 'U'}
                    </div>
                    <div>
                        <h2 className="font-bold text-lg text-slate-800">{identity.name || identity.username}</h2>
                        <p className="text-xs text-slate-400">{identity.email || t('profile.noEmail')}</p>
                    </div>
                </div>
                <div className="flex gap-4 text-sm border-l border-slate-100 pl-6">
                    <div>
                        <span className="block text-xs text-slate-400 uppercase font-semibold">{t('profile.username')}</span>
                        <span className="font-medium text-slate-700">{identity.username}</span>
                    </div>
                    <div>
                        <span className="block text-xs text-slate-400 uppercase font-semibold">{t('profile.groups')}</span>
                        <span className="font-medium text-slate-700 capitalize">
                            {identity.groups?.join(', ') || 'user'}
                        </span>
                    </div>
                </div>
            </section>

            {/* Tab navigation */}
            <div className="border-b border-slate-200">
                <nav className="-mb-px flex flex-wrap gap-1">
                    <button
                        type="button"
                        onClick={() => setActiveTab('taccuino')}
                        className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${activeTab === 'taccuino' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        Su di me e libretto
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('strumenti')}
                        className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${activeTab === 'strumenti' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        Strumenti utilizzati
                    </button>
                </nav>
            </div>

            {activeTab === 'taccuino' && (
            <section className="space-y-4" aria-labelledby="personal-profile-section">
                <div>
                    <h2 id="personal-profile-section" className="text-lg font-bold text-slate-800">
                        Su di me
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                        Questa sezione riguarda solo il tuo profilo: non cambia quando scegli una compilazione.
                    </p>
                </div>
                <LearnerProfileCard variant="edit" />
                <ProfileChangeReflection lang={lang} />
            </section>
            )}

            {activeTab === 'strumenti' && (
            <>
            <section className="glass-panel p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-indigo-500" />
                            {t('profile.myCompilations')}
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                            Cerca e scegli una compilazione: la selezione aggiorna solo il risultato qui sotto.
                        </p>
                    </div>
                    <span className="text-xs font-semibold text-slate-400">
                        {filteredSessions.length} / {sessions.length}
                    </span>
                </div>
                {sessions.length === 0 ? (
                    <div className="text-center py-10 px-4 border border-dashed border-slate-200 rounded-xl bg-white space-y-4">
                        <div className="w-12 h-12 mx-auto rounded-full bg-indigo-50 flex items-center justify-center">
                            <FileText className="w-6 h-6 text-indigo-400" />
                        </div>
                        <p className="text-sm text-slate-500 max-w-xs mx-auto">{t('profile.noSessions')}</p>
                        <Link
                            href="/"
                            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
                        >
                            {t('selector.start')}
                        </Link>
                    </div>
                ) : (
                    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.45fr)]">
                        <label className="block">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Compilazione attiva</span>
                            <select
                                value={selectedSession?.session_id || ''}
                                onChange={(event) => {
                                    const next = filteredSessions.find((session) => session.session_id === event.target.value) || null;
                                    setSelectedSession(next);
                                    setShowDeleteConfirm(null);
                                }}
                                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            >
                                {filteredSessions.length === 0 && <option value="">Nessuna compilazione trovata</option>}
                                {filteredSessions.map((session) => (
                                    <option key={session.session_id} value={session.session_id}>
                                        {formatSessionOption(session)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="block">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cerca</span>
                            <div className="mt-1 flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2">
                                <Search className="h-4 w-4 text-slate-400" />
                                <input
                                    value={sessionSearch}
                                    onChange={(event) => setSessionSearch(event.target.value)}
                                    placeholder="Data, strumento o ID"
                                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                                />
                            </div>
                        </label>
                    </div>
                )}
            </section>

            <section className="space-y-6" aria-labelledby="selected-session-details">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 id="selected-session-details" className="text-lg font-bold text-slate-800">
                        Risultato della compilazione
                    </h2>
                    {selectedSession && (
                        <span className={`px-3 py-0.5 border text-xs font-bold rounded-full uppercase ${getTypeColor(selectedSession.questionnaire_type)}`}>
                            {selectedSession.questionnaire_type} · {selectedSession.session_id.slice(0, 8)}
                        </span>
                    )}
                </div>
                {selectedSession ? (
                    <>
                        <div className="glass-panel p-6 space-y-6">
                            {/* Session Detail Header */}
                            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`px-3 py-0.5 border text-xs font-bold rounded-full uppercase ${getTypeColor(selectedSession.questionnaire_type)}`}>
                                            {selectedSession.questionnaire_type}
                                        </span>
                                        <span className="text-xs text-slate-500 font-medium">
                                            {t('profile.submittedOn', { date: new Date(selectedSession.submitted_at).toLocaleString(lang) })}
                                        </span>
                                    </div>
                                    <p className="text-xs font-mono text-slate-400">
                                        {t('history.session')} ID: {selectedSession.session_id}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => handleDownloadPdf(selectedSession.session_id, selectedSession.questionnaire_type)}
                                        className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-600 transition-colors"
                                        title={t('completed.downloadPdf')}
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        PDF
                                    </button>
                                    
                                    {showDeleteConfirm === selectedSession.session_id ? (
                                        <div className="flex items-center gap-1 bg-red-50 border border-red-100 rounded-lg p-1 animate-fade-in">
                                            <span className="text-[10px] font-semibold text-red-700 px-2">{t('profile.deleteShortConfirm')}</span>
                                            <button
                                                onClick={() => handleDelete(selectedSession.session_id)}
                                                disabled={actionLoading === selectedSession.session_id}
                                                className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-bold"
                                            >
                                                {t('profile.yes')}
                                            </button>
                                            <button
                                                onClick={() => setShowDeleteConfirm(null)}
                                                className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 rounded text-[10px] font-medium"
                                            >
                                                {t('profile.no')}
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setShowDeleteConfirm(selectedSession.session_id)}
                                            className="p-2 border border-red-200 hover:bg-red-50 text-red-600 hover:text-red-700 rounded-lg transition-colors"
                                            title={t('profile.deleteTooltip')}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Render Scores Visual Chart if quantitative */}
                            {selectedSession.questionnaire_type !== 'SAVICKAS' && selectedSession.scores && (
                                <div className="space-y-3 bg-white p-4 border border-slate-100 rounded-xl">
                                    <h3 className="text-sm font-bold text-slate-700">{t('profile.factorBreakdown')}</h3>
                                    
                                    <div className="h-64">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={isDark ? '#334155' : '#e2e8f0'} />
                                                <XAxis dataKey="code" tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} />
                                                <YAxis domain={[0, 9]} ticks={[1, 3, 5, 7, 9]} tick={{ fontSize: 11, fill: isDark ? '#94a3b8' : '#64748b' }} />
                                                <Tooltip content={(p: TooltipContentProps<number, string>) => {
                                                    if (!p.active || !p.payload?.length) return null;
                                                    const d = p.payload[0].payload;
                                                    return (
                                                        <div className="bg-white border border-slate-200 shadow-md rounded-lg p-2.5 text-xs max-w-xs">
                                                            <p className="font-semibold text-slate-800">{d.code} - {d.name}</p>
                                                            <p className="text-indigo-600 font-bold mt-1">{t('profile.stanineScoreLabel')} {d.value} / 9</p>
                                                        </div>
                                                    );
                                                }} />
                                                <Bar dataKey="value" maxBarSize={30}>
                                                    {chartData.map((entry, index) => (
                                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                                    ))}
                                                    <LabelList dataKey="value" position="top" style={{ fontSize: '10px', fill: isDark ? '#cbd5e1' : '#475569', fontWeight: 'bold' }} />
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            )}

                            {/* Detailed Grid of Factors */}
                            {selectedSession.questionnaire_type === 'SAVICKAS' ? (
                                <div className="space-y-4 text-center py-8">
                                    <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                                        <MessageSquare className="w-6 h-6" />
                                    </div>
                                    <div className="max-w-md mx-auto space-y-2">
                                        <h3 className="font-bold text-slate-800">{t('profile.savickasTitle')}</h3>
                                        <p className="text-sm text-slate-500 leading-relaxed">
                                            {t('profile.savickasDesc')}
                                        </p>
                                    </div>
                                </div>
                            ) : selectedSession.scores ? (
                                <div className="space-y-3">
                                    <h3 className="text-sm font-bold text-slate-700">{t('profile.factorEvaluation')}</h3>
                                    
                                    <div className="grid sm:grid-cols-2 gap-3">
                                        {Object.entries(selectedSession.scores).map(([code, val]) => {
                                            const config = QUESTIONNAIRES[selectedSession.questionnaire_type as QuestionnaireType];
                                            const factorDef = config?.factors.find(f => f.code === code);
                                            const inverted = config?.invertedFactors.includes(code);
                                            
                                            const isStrength = inverted ? val <= 3 : val >= 7;
                                            const isGrowth = inverted ? val >= 7 : val <= 3;
                                            
                                            let badgeColor = 'bg-yellow-50 text-yellow-700 border-yellow-200';
                                            let evaluation = t('profile.normal');
                                            if (isStrength) {
                                                badgeColor = 'bg-green-50 text-green-700 border-green-200';
                                                evaluation = t('profile.strength');
                                            } else if (isGrowth) {
                                                badgeColor = 'bg-red-50 text-red-700 border-red-200';
                                                evaluation = t('profile.growth');
                                            }

                                            return (
                                                <div key={code} className="border border-slate-100 rounded-xl p-3 bg-white space-y-1.5 flex flex-col justify-between">
                                                    <div>
                                                        <div className="flex justify-between items-start gap-2">
                                                            <span className="font-bold text-xs text-slate-800">{code} - {tf(`factor.${code}.name`, factorDef?.name || code)}</span>
                                                            <span className={`px-2 py-0.5 border text-[10px] font-semibold rounded-full shrink-0 ${badgeColor}`}>
                                                                {evaluation}
                                                            </span>
                                                        </div>
                                                        {factorDef?.description && (
                                                            <p className="text-[11px] text-slate-400 leading-normal mt-1">{tf(`factor.${code}.desc`, factorDef.description)}</p>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-50">
                                                        <span className="text-sm font-bold text-indigo-700">{val}</span>
                                                        <span className="text-[10px] text-slate-400">{t('profile.stanineLabel')}</span>
                                                        {inverted && <span className="text-[9px] text-slate-400 italic">{t('profile.invertedShort')}</span>}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : null}

                            {/* Call to Action: ancorata in fondo alla card, sempre raggiungibile
                                senza scrollare tutta la scheda fattori. */}
                            <div className="sticky bottom-0 -mx-6 -mb-6 mt-2 px-6 pt-3 pb-6 bg-gradient-to-t from-[var(--console-surface)] via-[var(--console-surface)] to-transparent rounded-b-xl">
                                <Link
                                    href={`/?session_id=${selectedSession.session_id}&instrument=${selectedSession.questionnaire_type}`}
                                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-md text-sm text-center shadow-lg shadow-indigo-600/20 transition-colors flex items-center justify-center gap-2"
                                >
                                    <MessageSquare className="w-4 h-4" />
                                    {t('history.resume')}
                                </Link>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="glass-panel p-12 text-center space-y-4 text-slate-400">
                        <FileText className="w-12 h-12 mx-auto text-slate-200" />
                        <p className="font-medium">{t('profile.selectSession')}</p>
                    </div>
                )}
            </section>
            </>
            )}

            {activeTab === 'taccuino' && (
            <section className="space-y-4" aria-labelledby="student-booklet-section">
                <div>
                    <h2 id="student-booklet-section" className="text-lg font-bold text-slate-800">
                        Libretto dello studente
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                        Ogni strumento ha il suo libretto: scegli lo strumento, compila, salva e scarica il PDF.
                    </p>
                </div>
                <div className="glass-panel p-5">
                    <label className="block">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Strumento del libretto</span>
                        <select
                            value={selectedBookletType}
                            onChange={(event) => setSelectedBookletType(event.target.value as QuestionnaireType)}
                            className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                        >
                            {BOOKLET_TYPES.map((type) => (
                                <option key={type} value={type}>
                                    {type} · {QUESTIONNAIRES[type].fullName}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
                <StudentBookletCard questionnaireType={selectedBookletType} lang={lang} />
            </section>
            )}
        </div>
    );
}
