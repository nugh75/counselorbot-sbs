'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n-context';
import { PageHeader } from '@/components/ui/PageHeader';
import { PersonalAreaHeader } from '@/components/profile/PersonalAreaHeader';
import { apiFetch, getIdentity, type Identity } from '@/lib/auth';
import { canUsePersonalPage, canUseTeacherAssistant } from '@/lib/roles';
import { useDarkMode } from '@/lib/use-dark-mode';
import { toast } from '@/components/ui/Toast';
import { Skeleton } from '@/components/ui/Skeleton';
import { QUESTIONNAIRES, QuestionnaireType } from '@/lib/questionnaires';
import { addCompletedProfile, clearCompletedProfiles } from '@/lib/profile-tracker';
import { LearnerProfileCard } from '@/components/profile/LearnerProfileCard';
import { ResultReadingCard } from '@/components/profile/ResultReadingCard';
import { PortfolioCard } from '@/components/profile/PortfolioCard';
import { PersonalAreaHome } from '@/components/profile/PersonalAreaHome';
import { personalAreaText, personalAreaName, personalAreaDescription } from '@/lib/i18n-personal-area';
import { TavoloList } from '@/components/tavolo/TavoloList';
import { CrossSynthesisCard } from '@/components/profile/CrossSynthesisCard';
import { TelegramLinkCard } from '@/components/profile/TelegramLinkCard';
import { TeacherNotesCard } from '@/components/profile/TeacherNotesCard';
import { AssignmentsPanel } from '@/components/teacher/AssignmentsPanel';
import { learningText } from '@/lib/i18n-assignment-work';
import { MyGroupsCard } from '@/components/profile/MyGroupsCard';
import OrientationDirectoryCard from '@/components/profile/OrientationDirectoryCard';
import {
    Trash2, Download, MessageSquare, ShieldAlert, Search,
    NotebookPen, UsersRound, Send, FolderOpen, ClipboardList, Compass, Route, Table2, GraduationCap, BookOpen,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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

type PersonalSection = 'assignments' | 'notebook' | 'groups' | 'telegram' | 'portfolio' | 'sessions' | 'orientation' | 'timeline' | 'tavolo' | 'flashcards' | 'pqbl';

const PERSONAL_AREAS = [
    { id: 'assignments', slug: 'assegnazioni', icon: ClipboardList, image: '/images/platform/assegnazioni.png', titleKey: 'received', descriptionKey: 'intro' },
    {
        id: 'notebook',
        slug: 'taccuino',
        icon: NotebookPen,
        image: '/images/platform/su-di-me.png',
        titleKey: 'profile.about.title',
        descriptionKey: 'profile.about.subtitle',
    },
    {
        id: 'orientation',
        slug: 'orientamento',
        icon: Compass,
        image: '/images/platform/bussola.png',
        titleKey: 'referrals.area.title',
        descriptionKey: 'referrals.area.description',
    },
    {
        id: 'groups',
        slug: 'classi',
        icon: UsersRound,
        image: '/images/platform/classi.png',
        titleKey: 'profile.area.classes.title',
        descriptionKey: 'profile.area.classes.description',
    },
    {
        id: 'telegram',
        slug: 'telegram',
        icon: Send,
        image: '/images/platform/telegram.png',
        titleKey: 'profile.area.telegram.title',
        descriptionKey: 'profile.area.telegram.description',
    },
    {
        id: 'portfolio',
        slug: 'portfolio',
        icon: FolderOpen,
        image: '/images/platform/portfolio.png',
        titleKey: 'profile.portfolioSection.title',
        descriptionKey: 'profile.portfolioSection.subtitle',
    },
    {
        id: 'timeline',
        slug: 'timeline',
        icon: Route,
        image: '/images/platform/linea-del-tempo.png',
        titleKey: 'timeline',
        descriptionKey: 'timelinePurpose',
    },
    {
        id: 'pqbl',
        slug: 'pqbl',
        icon: BookOpen,
        image: '/images/intro/practice.png',
        titleKey: 'pqbl.card.title',
        descriptionKey: 'pqbl.card.desc',
    },
    {
        id: 'flashcards',
        slug: 'flashcard',
        icon: GraduationCap,
        image: '/images/cards/feedback_loop.png',
        titleKey: 'profile.area.flashcards.title',
        descriptionKey: 'profile.area.flashcards.description',
    },
    {
        id: 'sessions',
        slug: 'compilazioni',
        icon: ClipboardList,
        image: '/images/platform/compilazioni.png',
        titleKey: 'profile.myCompilations',
        descriptionKey: 'profile.sessions.subtitle',
    },
    {
        id: 'tavolo',
        slug: 'tavolo',
        icon: Table2,
        image: '/images/platform/tavolo.png',
        titleKey: 'profile.tavolo.title',
        descriptionKey: 'profile.tavolo.subtitle',
    },
] as const;

function personalSectionFromPath(pathname: string): PersonalSection | null {
    const slug = pathname.split('/').filter(Boolean)[1];
    return PERSONAL_AREAS.find((area) => area.slug === slug)?.id ?? null;
}

export default function ProfilePage() {
    const { t, tf, lang } = useI18n();
    const pathname = usePathname();
    const isDark = useDarkMode();
    const [identity, setIdentity] = useState<Identity | null>(null);
    const [sessions, setSessions] = useState<QuestionnaireResult[]>([]);
    const [selectedSession, setSelectedSession] = useState<QuestionnaireResult | null>(null);
    const [conversation, setConversation] = useState<Array<{ role: string; text: string }> | null>(null);
    const [convLoading, setConvLoading] = useState(false);
    const [sessionSummary, setSessionSummary] = useState<string | null>(null);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
    const [sessionSearch, setSessionSearch] = useState('');
    const activeSection = personalSectionFromPath(pathname);
    const personalAreas = PERSONAL_AREAS.map((area) => ({
        ...area,
        href: `/profilo/${area.slug}`,
        title: personalAreaName(lang, area.slug),
        description: personalAreaDescription(lang, area.slug),
    }));
    const activeArea = personalAreas.find((area) => area.id === activeSection) ?? null;

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const id = await getIdentity();
            if (id?.authenticated) {
                setIdentity(id);
                if (!activeSection) return;
                const res = await apiFetch('/api/user/questionnaire-results');
                if (res.ok) {
                    const payload: unknown = await res.json();
                    if (Array.isArray(payload)) {
                        const data = payload as QuestionnaireResult[];
                        setSessions(data);
                        // `?instrument=` arrives from old booklet links: open that instrument's latest result.
                        const requested = new URLSearchParams(window.location.search).get('instrument');
                        const first = data.find((session) => session.questionnaire_type === requested) ?? data[0] ?? null;
                        setSelectedSession((selected) => (
                            selected
                                ? data.find((session) => session.session_id === selected.session_id) ?? first
                                : first
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
    }, [activeSection]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useEffect(() => {
        if (activeSection !== 'sessions' || !selectedSession) {
            setConversation(null);
            setSessionSummary(null);
            return;
        }
        setConvLoading(true);
        setSummaryLoading(true);
        setConversation(null);
        setSessionSummary(null);

        let active = true;
        apiFetch(`/api/user/questionnaire-result/${selectedSession.session_id}/conversation`)
            .then(async (res) => {
                if (!res.ok) throw new Error('Failed to fetch conversation');
                const data = await res.json();
                if (active) setConversation(data as Array<{ role: string; text: string }>);
            })
            .catch((err) => {
                if (!active) return;
                console.error("Error loading conversation:", err);
            })
            .finally(() => {
                if (active) setConvLoading(false);
            });

        apiFetch(`/api/user/questionnaire-result/${selectedSession.session_id}/summary?lang=${lang}`)
            .then(async (res) => {
                if (!res.ok) throw new Error('Failed to fetch summary');
                const data = await res.json();
                if (active) setSessionSummary((data as { summary?: string | null }).summary ?? null);
            })
            .catch((err) => {
                if (!active) return;
                console.error("Error loading summary:", err);
            })
            .finally(() => {
                if (active) setSummaryLoading(false);
            });

        return () => { active = false; };
    }, [activeSection, selectedSession, lang]);

    const handleDelete = async (sessionId: string) => {
        setActionLoading(sessionId);
        try {
            const res = await apiFetch(`/api/questionnaire-result/${sessionId}`, {
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
            const res = await apiFetch(`/api/questionnaire-result/${sessionId}/pdf?lang=${lang}`);
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
            {activeArea ? <PersonalAreaHeader slug={activeArea.slug} /> : <PageHeader
                backHref="/"
                title={personalAreaText(lang, 'title')}
                subtitle={personalAreaText(lang, 'intro')}
            />}

            {!activeArea && <PersonalAreaHome />}

            {activeSection && ['notebook', 'sessions'].includes(activeSection) && <p className="rounded-lg border border-slate-200 p-3 text-sm text-slate-600">{learningText(lang, 'groupVisibility')}</p>}
            {activeSection === 'notebook' && (
            <section className="space-y-4" aria-label={t('profile.about.title')}>
                <LearnerProfileCard variant="edit" />
                <TeacherNotesCard lang={lang} />
                <Link
                    href="/profilo/cambiamenti"
                    className="glass-panel p-5 block hover:bg-slate-50 transition-colors"
                >
                    <div>
                        <h3 className="font-bold text-slate-800">{t('profileChanges.title')}</h3>
                        <p className="text-sm text-slate-500">{t('profileChanges.cardBody')}</p>
                    </div>
                </Link>
            </section>
            )}

            {activeSection === 'sessions' && (
            <>
            <section className="glass-panel p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">
                            {t('profile.myCompilations')}
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                            {t('profile.sessions.subtitle')}
                        </p>
                    </div>
                    <span className="text-xs font-semibold text-slate-500">
                        {filteredSessions.length} / {sessions.length}
                    </span>
                </div>
                {sessions.length === 0 ? (
                    <div className="text-center py-10 px-4 border border-dashed border-slate-200 rounded-xl bg-white space-y-4">
                        <p className="text-sm text-slate-500 max-w-xs mx-auto">{t('profile.noSessions')}</p>
                        <Link
                            href="/"
                            className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
                        >
                            {t('selector.start')}
                        </Link>
                    </div>
                ) : (
                    <div className="grid gap-3 lg:grid-cols-[minmax(260px,0.45fr)_minmax(0,1fr)]">
                        <label className="block">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('profile.sessions.search')}</span>
                            <div className="mt-1 flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2">
                                <Search className="h-4 w-4 text-slate-500" />
                                <input
                                    value={sessionSearch}
                                    onChange={(event) => setSessionSearch(event.target.value)}
                                    placeholder={t('profile.sessions.searchPlaceholder')}
                                    className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                                />
                            </div>
                        </label>
                        <label className="block">
                            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('profile.sessions.active')}</span>
                            <select
                                value={selectedSession?.session_id || ''}
                                onChange={(event) => {
                                    const next = filteredSessions.find((session) => session.session_id === event.target.value) || null;
                                    setSelectedSession(next);
                                    setShowDeleteConfirm(null);
                                }}
                                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            >
                                {filteredSessions.length === 0 && <option value="">{t('profile.sessions.noneFiltered')}</option>}
                                {filteredSessions.map((session) => (
                                    <option key={session.session_id} value={session.session_id}>
                                        {formatSessionOption(session)}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                )}
            </section>

            <section className="space-y-6" aria-labelledby="selected-session-details">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 id="selected-session-details" className="text-lg font-bold text-slate-800">
                        {t('profile.sessions.resultTitle')}
                    </h2>
                    {selectedSession && (
                        // Prima il badge portava lo strumento e otto cifre
                        // dell'UUID di sessione: un identificativo tecnico che
                        // non aiuta a riconoscere quale compilazione si sta
                        // guardando. La data sì. L'id resta nel `title`, dove
                        // serve al supporto e non allo studente.
                        <span
                            title={selectedSession.session_id}
                            className={`px-3 py-0.5 border text-xs font-bold rounded-full uppercase ${getTypeColor(selectedSession.questionnaire_type)}`}
                        >
                            {selectedSession.questionnaire_type} · {new Date(selectedSession.submitted_at).toLocaleDateString(lang)}
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
                                    <p className="text-xs font-mono text-slate-500">
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
                                            <span className="text-2xs font-semibold text-red-700 px-2">{t('profile.deleteShortConfirm')}</span>
                                            <button
                                                onClick={() => handleDelete(selectedSession.session_id)}
                                                disabled={actionLoading === selectedSession.session_id}
                                                className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-2xs font-bold"
                                            >
                                                {t('profile.yes')}
                                            </button>
                                            <button
                                                onClick={() => setShowDeleteConfirm(null)}
                                                className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 rounded text-2xs font-medium"
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

                            {/* The final guided response is the synthesis for every instrument. */}
                            <div className="space-y-3 bg-white p-4 border border-slate-100 rounded-xl">
                                <h3 className="text-sm font-bold text-slate-700">{t('profile.sessionSummary.title')}</h3>
                                {summaryLoading ? (
                                    <div className="py-4 text-center text-xs text-slate-500">
                                        {t('profile.sessionSummary.loading')}
                                    </div>
                                ) : sessionSummary ? (
                                    <div className="prose prose-sm max-w-none text-slate-700 prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-li:my-0">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{sessionSummary}</ReactMarkdown>
                                    </div>
                                ) : (
                                    <p className="py-2 text-sm text-slate-500">
                                        {t('profile.sessionSummary.pending')}
                                    </p>
                                )}
                            </div>

                            {/* Render Scores Visual Chart if quantitative */}
                            {chartData.length > 0 && (
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
                            {chartData.length > 0 && selectedSession.scores ? (
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
                                                            <span className={`px-2 py-0.5 border text-2xs font-semibold rounded-full shrink-0 ${badgeColor}`}>
                                                                {evaluation}
                                                            </span>
                                                        </div>
                                                        {factorDef?.description && (
                                                            <p className="text-[11px] text-slate-500 leading-normal mt-1">{tf(`factor.${code}.desc`, factorDef.description)}</p>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-50">
                                                        <span className="text-sm font-bold text-indigo-700">{val}</span>
                                                        <span className="text-2xs text-slate-500">{t('profile.stanineLabel')}</span>
                                                        {inverted && <span className="text-[9px] text-slate-500 italic">{t('profile.invertedShort')}</span>}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : null}

                            {/* Render Chat Conversation */}
                            <div className="space-y-3 bg-white p-4 border border-slate-100 rounded-xl">
                                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                    <MessageSquare className="w-4 h-4 text-indigo-600" />
                                    {t('profile.conversation.title')}
                                </h3>
                                
                                {convLoading && (
                                    <div className="py-6 text-center text-xs text-slate-500">
                                        {t('profile.conversation.loading')}
                                    </div>
                                )}
                                
                                {!convLoading && conversation && conversation.length === 0 && (
                                    <p className="text-xs text-slate-500 text-center py-4">
                                        {t('profile.conversation.empty')}
                                    </p>
                                )}
                                
                                {!convLoading && conversation && conversation.length > 0 && (
                                    <div className="max-h-96 overflow-y-auto space-y-3 pr-2 border-l border-slate-100 pl-4 mt-2">
                                        {conversation.map((msg, index) => (
                                            <div
                                                key={index}
                                                className={`flex flex-col ${msg.role === 'student' ? 'items-end' : 'items-start'}`}
                                            >
                                                <span className="text-2xs font-semibold text-slate-500 mb-0.5 uppercase tracking-wider">
                                                    {msg.role === 'student' ? t('profile.conversation.student') : 'CounselorBot'}
                                                </span>
                                                <div
                                                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed break-words ${
                                                        msg.role === 'student'
                                                            ? 'bg-indigo-600 text-white prose prose-sm prose-invert prose-p:my-0 prose-headings:my-1 prose-ul:my-0.5 prose-li:my-0'
                                                            : 'bg-slate-100 text-slate-800 border border-slate-200/60 prose prose-sm prose-p:my-0 prose-headings:my-1 prose-ul:my-0.5 prose-li:my-0'
                                                    }`}
                                                >
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.text}</ReactMarkdown>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <ResultReadingCard key={selectedSession.session_id} sessionId={selectedSession.session_id} questionnaireType={selectedSession.questionnaire_type} scores={selectedSession.scores} />
                    </>
                ) : (
                    <div className="glass-panel p-12 text-center space-y-4 text-slate-500">
                        <p className="font-medium">{t('profile.selectSession')}</p>
                    </div>
                )}
            </section>

            <CrossSynthesisCard />
            </>
            )}

            {activeSection === 'assignments' && <AssignmentsPanel showHeading={false} />}
            {activeSection === 'groups' && <MyGroupsCard lang={lang} showHeading={false} canManageGroups={canUseTeacherAssistant(identity)} />}

            {activeSection === 'telegram' && <TelegramLinkCard lang={lang} showHeading={false} />}

            {activeSection === 'orientation' && (
            <section className="space-y-4" aria-label={t('referrals.area.title')}>
                <OrientationDirectoryCard />
            </section>
            )}

            {activeSection === 'portfolio' && (
            <section className="space-y-4" aria-label={t('profile.portfolioSection.title')}>
                <PortfolioCard />
            </section>
            )}
            {activeSection === 'tavolo' && (
            <section className="space-y-4" aria-label={t('profile.tavolo.title')}>
                <TavoloList />
            </section>
            )}
        </div>
    );
}
