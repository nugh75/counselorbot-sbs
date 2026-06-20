'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Settings, FileText, ClipboardList, ShieldAlert, BarChart3, ListChecks, Database, BrainCircuit, GraduationCap, Coins, SlidersHorizontal, Gauge, Users } from 'lucide-react';
import { ConfigForm } from '@/components/admin/ConfigForm';
import { LogViewer } from '@/components/admin/LogViewer';
import { CostStats } from '@/components/admin/CostStats';
import { PresetsPanel } from '@/components/admin/PresetsPanel';
import { BenchmarkPanel } from '@/components/admin/BenchmarkPanel';
import { CounselorsPanel } from '@/components/admin/CounselorsPanel';
import { SurveyViewer } from '@/components/admin/SurveyViewer';
import { QuestionnaireResultsViewer } from '@/components/admin/QuestionnaireResultsViewer';
import { QuestionnaireEditor } from '@/components/admin/QuestionnaireEditor';
import { ValidationExportPanel } from '@/components/admin/ValidationExportPanel';
import { TrainingDatasetPanel } from '@/components/admin/TrainingDatasetPanel';
import { PqblAdminPanel } from '@/components/admin/PqblAdminPanel';
import { getIdentity } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';

import { cn } from '@/lib/utils';

export default function AdminPage() {
    const router = useRouter();
    const { t } = useI18n();
    const [activeTab, setActiveTab] = useState<'config' | 'logs' | 'costs' | 'presets' | 'benchmark' | 'counselors' | 'surveys' | 'results' | 'questionnaires' | 'validation' | 'training' | 'pqbl'>('config');
    const [authState, setAuthState] = useState<'loading' | 'admin' | 'forbidden'>('loading');

    useEffect(() => {
        getIdentity().then((id) => {
            setAuthState(id?.is_admin ? 'admin' : 'forbidden');
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
                            <h1 className="font-bold text-3xl text-slate-900">{t('admin.dashboard')}</h1>
                            <p className="text-sm text-slate-500 mt-1">CounselorBot</p>
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
                {/* Tabs */}
                <div className="flex flex-wrap gap-3 mb-8">
                    <button
                        onClick={() => setActiveTab('config')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border",
                            activeTab === 'config'
                                ? "bg-indigo-50 border-indigo-100 text-indigo-600"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                    >
                        <Settings className="w-4 h-4" />
                        {t('admin.tab.config')}
                    </button>
                    <button
                        onClick={() => setActiveTab('logs')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border",
                            activeTab === 'logs'
                                ? "bg-indigo-50 border-indigo-100 text-indigo-600"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                    >
                        <FileText className="w-4 h-4" />
                        {t('admin.tab.logs')}
                    </button>
                    <button
                        onClick={() => setActiveTab('costs')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border",
                            activeTab === 'costs'
                                ? "bg-indigo-50 border-indigo-100 text-indigo-600"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                    >
                        <Coins className="w-4 h-4" />
                        {t('admin.tab.costs')}
                    </button>
                    <button
                        onClick={() => setActiveTab('presets')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border",
                            activeTab === 'presets'
                                ? "bg-indigo-50 border-indigo-100 text-indigo-600"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                    >
                        <SlidersHorizontal className="w-4 h-4" />
                        {t('admin.tab.presets')}
                    </button>
                    <button
                        onClick={() => setActiveTab('benchmark')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border",
                            activeTab === 'benchmark'
                                ? "bg-indigo-50 border-indigo-100 text-indigo-600"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                    >
                        <Gauge className="w-4 h-4" />
                        {t('admin.tab.benchmark')}
                    </button>
                    <button
                        onClick={() => setActiveTab('counselors')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border",
                            activeTab === 'counselors'
                                ? "bg-indigo-50 border-indigo-100 text-indigo-600"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                    >
                        <Users className="w-4 h-4" />
                        {t('admin.tab.counselors')}
                    </button>
                    <button
                        onClick={() => setActiveTab('surveys')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border",
                            activeTab === 'surveys'
                                ? "bg-indigo-50 border-indigo-100 text-indigo-600"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                    >
                        <ClipboardList className="w-4 h-4" />
                        {t('admin.tab.surveys')}
                    </button>
                    <button
                        onClick={() => setActiveTab('results')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border",
                            activeTab === 'results'
                                ? "bg-indigo-50 border-indigo-100 text-indigo-600"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                    >
                        <BarChart3 className="w-4 h-4" />
                        {t('admin.tab.results')}
                    </button>
                    <button
                        onClick={() => setActiveTab('questionnaires')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border",
                            activeTab === 'questionnaires'
                                ? "bg-indigo-50 border-indigo-100 text-indigo-600"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                    >
                        <ListChecks className="w-4 h-4" />
                        {t('admin.tab.questionnaires')}
                    </button>
                    <button
                        onClick={() => setActiveTab('training')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border",
                            activeTab === 'training'
                                ? "bg-indigo-50 border-indigo-100 text-indigo-600"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                    >
                        <BrainCircuit className="w-4 h-4" />
                        {t('admin.tab.training')}
                    </button>
                    <button
                        onClick={() => setActiveTab('pqbl')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border",
                            activeTab === 'pqbl'
                                ? "bg-indigo-50 border-indigo-100 text-indigo-600"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                    >
                        <GraduationCap className="w-4 h-4" />
                        {t('admin.tab.pqbl')}
                    </button>
                    <button
                        onClick={() => setActiveTab('validation')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border",
                            activeTab === 'validation'
                                ? "bg-indigo-50 border-indigo-100 text-indigo-600"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                        )}
                    >
                        <Database className="w-4 h-4" />
                        {t('admin.tab.validation')}
                    </button>
                </div>

                {/* Content */}
                <div className="animate-fade-in-up">
                    {activeTab === 'config' && <ConfigForm />}
                    {activeTab === 'logs' && <LogViewer />}
                    {activeTab === 'costs' && <CostStats />}
                    {activeTab === 'presets' && <PresetsPanel />}
                    {activeTab === 'benchmark' && <BenchmarkPanel />}
                    {activeTab === 'counselors' && <CounselorsPanel />}
                    {activeTab === 'surveys' && <SurveyViewer />}
                    {activeTab === 'results' && <QuestionnaireResultsViewer />}
                    {activeTab === 'questionnaires' && <QuestionnaireEditor />}
                    {activeTab === 'training' && <TrainingDatasetPanel />}
                    {activeTab === 'pqbl' && <PqblAdminPanel />}
                    {activeTab === 'validation' && <ValidationExportPanel />}
                </div>
            </section>
        </div>
    );
}
