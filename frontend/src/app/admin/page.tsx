'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Settings, FileText, ClipboardList, ShieldAlert, BarChart3, ListChecks, Database, BrainCircuit, GraduationCap, Coins, SlidersHorizontal, Gauge, Users, Award, MessageCircleQuestion, PanelLeftClose, PanelLeftOpen, CalendarDays, Eye } from 'lucide-react';
import { ConfigForm } from '@/components/admin/ConfigForm';
import { LogViewer } from '@/components/admin/LogViewer';
import { CostStats } from '@/components/admin/CostStats';
import { PresetsPanel } from '@/components/admin/PresetsPanel';
import { BenchmarkPanel } from '@/components/admin/BenchmarkPanel';
import { CounselorsPanel } from '@/components/admin/CounselorsPanel';
import { ApprovedStrategiesPanel } from '@/components/admin/ApprovedStrategiesPanel';
import { CertifiedStrategiesPanel } from '@/components/admin/CertifiedStrategiesPanel';
import { SurveyViewer } from '@/components/admin/SurveyViewer';
import { QuestionnaireResultsViewer } from '@/components/admin/QuestionnaireResultsViewer';
import { QuestionnaireEditor } from '@/components/admin/QuestionnaireEditor';
import { ValidationExportPanel } from '@/components/admin/ValidationExportPanel';
import { TrainingDatasetPanel } from '@/components/admin/TrainingDatasetPanel';
import { PqblAdminPanel } from '@/components/admin/PqblAdminPanel';
import { ResearchContactsPanel } from '@/components/admin/ResearchContactsPanel';
import { AdministrationPlansPanel } from '@/components/admin/AdministrationPlansPanel';
import { AssistantQuestionsPanel } from '@/components/admin/AssistantQuestionsPanel';
import { RolePreviewPanel } from '@/components/admin/RolePreviewPanel';
import { getRealIdentity } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { canUseResearchConsole } from '@/lib/roles';

import { cn } from '@/lib/utils';

type AdminTab = 'config' | 'logs' | 'costs' | 'presets' | 'benchmark' | 'counselors' | 'approvedStrategies' | 'certifiedStrategies' | 'assistantQuestions' | 'surveys' | 'results' | 'questionnaires' | 'validation' | 'researchContacts' | 'administrationPlans' | 'training' | 'pqbl' | 'rolePreview';

export default function AdminPage() {
    const router = useRouter();
    const { t } = useI18n();
    const [activeTab, setActiveTab] = useState<AdminTab>('config');
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [authState, setAuthState] = useState<'loading' | 'admin' | 'forbidden'>('loading');
    const navGroups: {
        title: string;
        items: { id: AdminTab; label: string; icon: typeof Settings }[];
    }[] = [
        {
            title: t('admin.group.aiConfig'),
            items: [
                { id: 'config', label: t('admin.tab.config'), icon: Settings },
                { id: 'presets', label: t('admin.tab.presets'), icon: SlidersHorizontal },
                { id: 'counselors', label: t('admin.tab.counselors'), icon: Users },
                { id: 'approvedStrategies', label: t('admin.tab.approvedStrategies'), icon: Database },
                { id: 'certifiedStrategies', label: t('admin.tab.certified'), icon: Award },
                { id: 'assistantQuestions', label: t('admin.tab.assistantQuestions'), icon: MessageCircleQuestion },
            ],
        },
        {
            title: t('admin.group.satisfaction'),
            items: [
                { id: 'surveys', label: t('admin.tab.surveys'), icon: ClipboardList },
            ],
        },
        {
            title: t('admin.group.research'),
            items: [
                { id: 'results', label: t('admin.tab.results'), icon: BarChart3 },
                { id: 'questionnaires', label: t('admin.tab.questionnaires'), icon: ListChecks },
                { id: 'validation', label: t('admin.tab.validation'), icon: Database },
                { id: 'researchContacts', label: t('admin.tab.researchContacts'), icon: Users },
                { id: 'administrationPlans', label: t('admin.tab.administrationPlans'), icon: CalendarDays },
            ],
        },
        {
            title: t('admin.group.training'),
            items: [
                { id: 'training', label: t('admin.tab.training'), icon: BrainCircuit },
            ],
        },
        {
            title: t('admin.group.monitoring'),
            items: [
                { id: 'logs', label: t('admin.tab.logs'), icon: FileText },
                { id: 'costs', label: t('admin.tab.costs'), icon: Coins },
                { id: 'benchmark', label: t('admin.tab.benchmark'), icon: Gauge },
            ],
        },
        {
            title: t('admin.group.pqbl'),
            items: [
                { id: 'pqbl', label: t('admin.tab.pqbl'), icon: GraduationCap },
            ],
        },
        {
            title: t('admin.group.preview'),
            items: [
                { id: 'rolePreview', label: t('admin.tab.rolePreview'), icon: Eye },
            ],
        },
    ];
    const activeItem = navGroups.flatMap((group) => group.items).find((item) => item.id === activeTab);

    useEffect(() => {
        getRealIdentity().then((id) => {
            setAuthState(canUseResearchConsole(id) ? 'admin' : 'forbidden');
        });
    }, []);

    if (authState === 'loading') {
        return <div className="min-h-[60vh] flex items-center justify-center text-slate-500">{t('admin.verifying')}</div>;
    }

    if (authState === 'forbidden') {
        return (
            <div className="min-h-[60vh] flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white border border-slate-200 p-8 rounded-lg text-center space-y-4 shadow-sm">
                    <div className="mx-auto w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center">
                        <ShieldAlert className="w-6 h-6 text-red-600" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900">{t('admin.forbidden.title')}</h2>
                    <p className="text-slate-500 text-sm">
                        {t('admin.forbidden.body')}
                    </p>
                    <button
                        onClick={() => router.push('/')}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium transition-colors"
                    >
                        {t('admin.forbidden.cta')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            <section className="page-wide px-4 py-8">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-indigo-600 rounded-md flex items-center justify-center">
                            <Settings className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="font-bold text-2xl text-slate-900">{t('admin.group.research')}</h1>
                            <p className="text-sm text-slate-500 mt-1">CounselorBot · {activeItem?.label}</p>
                        </div>
                    </div>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        {t('nav.home')}
                    </Link>
                </div>
                <div className={cn('grid gap-6', sidebarCollapsed ? 'lg:grid-cols-[4.5rem_1fr]' : 'lg:grid-cols-[17rem_1fr]')}>
                    <aside className="glass-panel p-3 lg:sticky lg:top-24 lg:self-start">
                        <div className={cn('mb-3 flex items-center', sidebarCollapsed ? 'justify-center' : 'justify-between')}>
                            {!sidebarCollapsed && (
                                <div>
                                    <h2 className="text-sm font-bold text-slate-900">{t('admin.group.research')}</h2>
                                    <p className="text-xs text-slate-500">{t('admin.header.subtitle')}</p>
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={() => setSidebarCollapsed((value) => !value)}
                                title={sidebarCollapsed ? t('admin.sidebar.expand') : t('admin.sidebar.collapse')}
                                aria-label={sidebarCollapsed ? t('admin.sidebar.expand') : t('admin.sidebar.collapse')}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                            >
                                {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                            </button>
                        </div>
                        <nav className="space-y-4">
                            {navGroups.map((group) => (
                                <div key={group.title}>
                                    {!sidebarCollapsed && (
                                    <h3 className="px-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                                        {group.title}
                                    </h3>
                                    )}
                                    <div className="mt-1 space-y-1">
                                        {group.items.map((item) => {
                                            const Icon = item.icon;
                                            const active = activeTab === item.id;
                                            return (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    onClick={() => setActiveTab(item.id)}
                                                    title={sidebarCollapsed ? item.label : undefined}
                                                    className={cn(
                                                        'flex w-full items-center rounded-md text-left text-sm font-medium transition-colors',
                                                        sidebarCollapsed ? 'h-10 justify-center px-0' : 'gap-2 px-3 py-2',
                                                        active
                                                            ? 'bg-indigo-50 text-indigo-700'
                                                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                                                    )}
                                                >
                                                    <Icon className="h-4 w-4 shrink-0" />
                                                    {!sidebarCollapsed && <span className="min-w-0 truncate">{item.label}</span>}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </nav>
                    </aside>

                    <div className="min-w-0 animate-fade-in-up">
                        {activeTab === 'config' && <ConfigForm />}
                        {activeTab === 'logs' && <LogViewer />}
                        {activeTab === 'costs' && <CostStats />}
                        {activeTab === 'presets' && <PresetsPanel />}
                        {activeTab === 'benchmark' && <BenchmarkPanel />}
                        {activeTab === 'counselors' && <CounselorsPanel />}
                        {activeTab === 'approvedStrategies' && <ApprovedStrategiesPanel />}
                        {activeTab === 'certifiedStrategies' && <CertifiedStrategiesPanel />}
                        {activeTab === 'assistantQuestions' && <AssistantQuestionsPanel />}
                        {activeTab === 'surveys' && <SurveyViewer />}
                        {activeTab === 'results' && <QuestionnaireResultsViewer />}
                        {activeTab === 'questionnaires' && <QuestionnaireEditor />}
                        {activeTab === 'researchContacts' && <ResearchContactsPanel />}
                        {activeTab === 'administrationPlans' && <AdministrationPlansPanel />}
                        {activeTab === 'training' && <TrainingDatasetPanel />}
                        {activeTab === 'pqbl' && <PqblAdminPanel />}
                        {activeTab === 'validation' && <ValidationExportPanel />}
                        {activeTab === 'rolePreview' && <RolePreviewPanel />}
                    </div>
                </div>
            </section>
        </div>
    );
}
