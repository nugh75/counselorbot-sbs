'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookOpen, Compass, Settings, FileText, ClipboardList, ShieldAlert, BarChart3, ListChecks, Database, BrainCircuit, GraduationCap, Coins, SlidersHorizontal, Gauge, Users, Award, MessageCircleQuestion, Wand2, PanelLeftClose, PanelLeftOpen, CalendarDays, Eye, FolderOpen, Bot, Download, Mic, Image as ImageIcon } from 'lucide-react';
import { ConfigForm, writeSectionParam } from '@/components/admin/ConfigForm';
import { LogViewer } from '@/components/admin/LogViewer';
import { CostStats } from '@/components/admin/CostStats';
import { PresetsPanel } from '@/components/admin/PresetsPanel';
import { PromptExperimentsPanel } from '@/components/admin/PromptExperimentsPanel';
import { BenchmarkPanel } from '@/components/admin/BenchmarkPanel';
import { CounselorsPanel } from '@/components/admin/CounselorsPanel';
import { ApprovedStrategiesPanel } from '@/components/admin/ApprovedStrategiesPanel';
import { ToolBriefsPanel } from '@/components/admin/ToolBriefsPanel';
import { ThreadGuardPanel } from '@/components/admin/ThreadGuardPanel';
import { CertifiedReadingsPanel } from '@/components/admin/CertifiedReadingsPanel';
import { OrientationReferralsPanel } from '@/components/admin/OrientationReferralsPanel';
import { CertifiedStrategiesPanel } from '@/components/admin/CertifiedStrategiesPanel';
import { SkillsPanel } from '@/components/admin/SkillsPanel';
import { SurveyViewer } from '@/components/admin/SurveyViewer';
import { QuestionnaireResultsViewer } from '@/components/admin/QuestionnaireResultsViewer';
import { QuestionnaireEditor } from '@/components/admin/QuestionnaireEditor';
import { ValidationExportPanel } from '@/components/admin/ValidationExportPanel';
import { TrainingDatasetPanel } from '@/components/admin/TrainingDatasetPanel';
import { PqblAdminPanel } from '@/components/admin/PqblAdminPanel';
import { ResearchContactsPanel } from '@/components/admin/ResearchContactsPanel';
import { AdministrationPlansPanel } from '@/components/admin/AdministrationPlansPanel';
import { AdminClassesPanel } from '@/components/admin/AdminClassesPanel';
import { GroupsPanel } from '@/components/admin/GroupsPanel';
import { AssistantQuestionsPanel } from '@/components/admin/AssistantQuestionsPanel';
import { AssistantAdminPanel } from '@/components/admin/AssistantAdminPanel';
import { RolePreviewPanel } from '@/components/admin/RolePreviewPanel';
import { RagDocsPanel } from '@/components/admin/RagDocsPanel';
import { TavoloImagesPanel } from '@/components/admin/TavoloImagesPanel';
import { GuidedStepQuestionsPanel } from '@/components/admin/GuidedStepQuestionsPanel';
import { PromptExportPanel } from '@/components/admin/PromptExportPanel';
import { PromptHealthPage } from '@/components/admin/PromptHealthPage';
import { UsersSummaryPanel } from '@/components/admin/UsersSummaryPanel';
import { AudioModelsPanel } from '@/components/admin/AudioModelsPanel';
import { getRealIdentity } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { canUseResearchConsole } from '@/lib/roles';
import { adminTabUrl, DEFAULT_ADMIN_TAB, parseAdminTab, type AdminTab } from '@/lib/admin-navigation';

import { cn } from '@/lib/utils';


export default function AdminPage() {
    const router = useRouter();
    const { t, lang } = useI18n();
    const [activeTab, setActiveTab] = useState<AdminTab>(() =>
        (typeof window !== 'undefined' && parseAdminTab(window.location.search)) || DEFAULT_ADMIN_TAB);
    const [classAdmin, setClassAdmin] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [authState, setAuthState] = useState<'loading' | 'admin' | 'forbidden'>('loading');
    const navGroups: {
        title: string;
        items: { id: AdminTab; label: string; icon: typeof Settings }[];
    }[] = [
        {
            title: t('admin.group.aiConfig'),
            items: [
                { id: 'assistantManager', label: t('admin.tab.assistantManager'), icon: Bot },
                { id: 'config', label: t('admin.tab.config'), icon: Settings },
                { id: 'presets', label: t('admin.tab.presets'), icon: SlidersHorizontal },
                { id: 'counselors', label: t('admin.tab.counselors'), icon: Users },
                { id: 'approvedStrategies', label: t('admin.tab.approvedStrategies'), icon: Database },
                { id: 'toolBriefs', label: t('admin.tab.toolBriefs'), icon: Compass },
                { id: 'threadGuard', label: t('admin.tab.threadGuard'), icon: Eye },
                { id: 'certifiedStrategies', label: t('admin.tab.certified'), icon: Award },
                { id: 'certifiedReadings', label: t('admin.tab.readings'), icon: BookOpen },
                { id: 'orientationReferrals', label: t('admin.tab.orientationReferrals'), icon: Compass },
                { id: 'skills', label: t('admin.tab.skills'), icon: Wand2 },
                { id: 'assistantQuestions', label: t('admin.tab.assistantQuestions'), icon: MessageCircleQuestion },
                { id: 'guidedStepQuestions', label: t('admin.tab.guidedStepQuestions'), icon: MessageCircleQuestion },
                { id: 'promptExport', label: t('admin.tab.promptExport'), icon: Download },
                { id: 'promptHealth', label: t('admin.tab.promptHealth'), icon: ShieldAlert },
                { id: 'ragDocs', label: t('admin.tab.ragDocs'), icon: FolderOpen },
                { id: 'tavoloImages', label: t('admin.tab.tavoloImages'), icon: ImageIcon },
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
                { id: 'groupsClasses', label: t('admin.tab.groupsClasses'), icon: Users },
                { id: 'usersSummary', label: t('admin.tab.usersSummary'), icon: Users },
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
                { id: 'promptExperiments', label: { it: 'Esperimenti sui prompt', en: 'Prompt experiments', es: 'Experimentos de prompts', fr: 'Expériences sur les prompts', de: 'Prompt-Experimente', sv: 'Promptexperiment' }[lang], icon: Gauge },
            ],
        },
        {
            title: t('admin.group.voice'),
            items: [
                { id: 'audio', label: t('admin.tab.audio'), icon: Mic },
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

    // `?section=` belongs to the configuration tab: drop it elsewhere so a reload does not reopen it.
    // `?tab=` mirrors the active tab, so reload, history back and deep links reopen it.
    useEffect(() => {
        if (activeTab !== 'config') writeSectionParam(null);
        try {
            const next = adminTabUrl(window.location.href, activeTab);
            if (next) window.history.replaceState(window.history.state, '', next);
        } catch { /* best effort only */ }
    }, [activeTab]);

    useEffect(() => {
        getRealIdentity().then((id) => {
            setAuthState(canUseResearchConsole(id) ? 'admin' : 'forbidden');
            setClassAdmin(id?.is_admin === true);
        });
    }, []);

    if (authState === 'loading') {
        return <div className="min-h-[60vh] flex items-center justify-center text-ink-muted">{t('admin.verifying')}</div>;
    }

    if (authState === 'forbidden') {
        return (
            <div className="min-h-[60vh] flex items-center justify-center p-4">
                <Card className="max-w-md w-full p-8 text-center space-y-4">
                    <div className="mx-auto w-12 h-12 bg-danger-soft rounded-lg flex items-center justify-center">
                        <ShieldAlert className="w-6 h-6 text-danger" />
                    </div>
                    <h2 className="text-xl font-semibold text-ink">{t('admin.forbidden.title')}</h2>
                    <p className="text-ink-muted text-sm">
                        {t('admin.forbidden.body')}
                    </p>
                    <Button onClick={() => router.push('/')} className="w-full">
                        {t('admin.forbidden.cta')}
                    </Button>
                </Card>
            </div>
        );
    }

    return (
        <div className="admin-shell min-h-screen bg-surface-sunken">
            <section className="mx-auto max-w-[96rem] px-0 py-6 sm:px-4 sm:py-8">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-4 xl:mb-8">
                    <PageHeader
                        title={t('admin.title')}
                        subtitle={<span className="text-sm">CounselorBot · {activeItem?.label}</span>}
                        icon={<div className="w-8 h-8 shrink-0 bg-brand rounded-control flex items-center justify-center">
                            <Settings className="w-5 h-5 text-ink-on-brand" />
                        </div>}
                    />
                    <div className="flex flex-wrap gap-2">
                        <BackButton variant="labelled" href="/docente" label={t('nav.teacherPanel')} />
                        <BackButton variant="labelled" href="/" label={t('nav.home')} />
                    </div>
                </div>

                <div className="rounded-card border border-line bg-surface shadow-card mb-4 p-4 xl:hidden">
                    <label htmlFor="admin-section" className="mb-2 block text-sm font-semibold text-ink-body">
                        {t('admin.header.subtitle')}
                    </label>
                    <select
                        id="admin-section"
                        value={activeTab}
                        onChange={(event) => setActiveTab(event.target.value as AdminTab)}
                        className="min-w-0 w-full rounded-control border border-line-strong bg-surface px-4 py-2 text-sm font-semibold text-ink outline-none focus:ring-2 focus:ring-focus"
                    >
                        {navGroups.map((group) => (
                            <optgroup key={group.title} label={group.title}>
                                {group.items.map((item) => (
                                    <option key={item.id} value={item.id}>{item.label}</option>
                                ))}
                            </optgroup>
                        ))}
                    </select>
                </div>

                <div className={cn(
                    'grid grid-cols-[minmax(0,1fr)] gap-6',
                    sidebarCollapsed
                        ? 'xl:grid-cols-[4.5rem_minmax(0,1fr)]'
                        : 'xl:grid-cols-[17rem_minmax(0,1fr)]',
                )}>
                    <aside className="rounded-card border border-line bg-surface shadow-card hidden p-4 xl:sticky xl:top-24 xl:block xl:self-start">
                        <div className={cn('mb-4 flex items-center', sidebarCollapsed ? 'justify-center' : 'justify-between')}>
                            {!sidebarCollapsed && (
                                <div>
                                    <h2 className="text-sm font-semibold text-ink">{t('admin.title')}</h2>
                                    <p className="text-xs text-ink-muted">{t('admin.header.subtitle')}</p>
                                </div>
                            )}
                            <Button variant="secondary"
                                type="button"
                                onClick={() => setSidebarCollapsed((value) => !value)}
                                title={sidebarCollapsed ? t('admin.sidebar.expand') : t('admin.sidebar.collapse')}
                                aria-label={sidebarCollapsed ? t('admin.sidebar.expand') : t('admin.sidebar.collapse')}
                                className="h-control w-control hover:text-ink">
                                {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                            </Button>
                        </div>
                        <nav className="space-y-4">
                            {navGroups.map((group) => (
                                <div key={group.title}>
                                    {!sidebarCollapsed && (
                                    <h3 className="px-2 text-2xs font-semibold text-ink-muted">
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
                                                        'flex min-h-control w-full items-center rounded-control text-left text-sm font-semibold transition-colors',
                                                        sidebarCollapsed ? 'justify-center px-0' : 'gap-2 px-4 py-2',
                                                        active
                                                            ? 'bg-brand-soft text-link'
                                                            : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
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
                        {activeTab === 'assistantManager' && <AssistantAdminPanel onOpenTab={(tab) => setActiveTab(tab)} />}
                        {activeTab === 'config' && <ConfigForm />}
                        {activeTab === 'logs' && <LogViewer />}
                        {activeTab === 'costs' && <CostStats />}
                        {activeTab === 'presets' && <PresetsPanel />}
                        {activeTab === 'benchmark' && <BenchmarkPanel />}
                        {activeTab === 'promptExperiments' && <PromptExperimentsPanel />}
                        {activeTab === 'counselors' && <CounselorsPanel />}
                        {activeTab === 'approvedStrategies' && <ApprovedStrategiesPanel />}
                        {activeTab === 'toolBriefs' && <ToolBriefsPanel />}
                        {activeTab === 'threadGuard' && <ThreadGuardPanel />}
                        {activeTab === 'certifiedStrategies' && <CertifiedStrategiesPanel />}
                        {activeTab === 'certifiedReadings' && <CertifiedReadingsPanel />}
                        {activeTab === 'orientationReferrals' && <OrientationReferralsPanel />}
                        {activeTab === 'skills' && <SkillsPanel />}
                        {activeTab === 'assistantQuestions' && <AssistantQuestionsPanel />}
                        {activeTab === 'guidedStepQuestions' && <GuidedStepQuestionsPanel />}
                        {activeTab === 'promptExport' && <PromptExportPanel />}
                        {activeTab === 'promptHealth' && <PromptHealthPage />}
                        {activeTab === 'ragDocs' && <RagDocsPanel />}
                        {activeTab === 'tavoloImages' && <TavoloImagesPanel />}
                        {activeTab === 'audio' && <AudioModelsPanel />}
                        {activeTab === 'surveys' && <SurveyViewer />}
                        {activeTab === 'results' && <QuestionnaireResultsViewer />}
                        {activeTab === 'questionnaires' && <QuestionnaireEditor />}
                        {activeTab === 'researchContacts' && <ResearchContactsPanel />}
                        {activeTab === 'administrationPlans' && <AdministrationPlansPanel />}
                        {activeTab === 'groupsClasses' && <div className="space-y-6">{classAdmin && <AdminClassesPanel />}<GroupsPanel basePath="/admin/classi" /></div>}
                        {activeTab === 'usersSummary' && <UsersSummaryPanel />}
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
