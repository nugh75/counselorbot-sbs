'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, FileText, ClipboardList, ShieldAlert } from 'lucide-react';
import { ConfigForm } from '@/components/admin/ConfigForm';
import { LogViewer } from '@/components/admin/LogViewer';
import { SurveyViewer } from '@/components/admin/SurveyViewer';
import { getIdentity } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';

import { cn } from '@/lib/utils';

export default function AdminPage() {
    const router = useRouter();
    const { t } = useI18n();
    const [activeTab, setActiveTab] = useState<'config' | 'logs' | 'surveys'>('config');
    const [authState, setAuthState] = useState<'loading' | 'admin' | 'forbidden'>('loading');

    useEffect(() => {
        getIdentity().then((id) => {
            setAuthState(id?.is_admin ? 'admin' : 'forbidden');
        });
    }, []);

    if (authState === 'loading') {
        return <div className="min-h-screen flex items-center justify-center text-gray-400">{t('admin.verifying')}</div>;
    }

    if (authState === 'forbidden') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <div className="max-w-md w-full glass-panel p-8 rounded-2xl text-center space-y-4 border border-white/10">
                    <div className="mx-auto w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                        <ShieldAlert className="w-6 h-6 text-red-600" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900">{t('admin.forbidden.title')}</h2>
                    <p className="text-muted-foreground text-sm">
                        {t('admin.forbidden.body')}
                    </p>
                    <button
                        onClick={() => router.push('/')}
                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                    >
                        {t('admin.forbidden.cta')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <section className="max-w-7xl mx-auto px-4 py-8">
                <div className="flex items-center gap-2 mb-8">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                        <Settings className="w-5 h-5 text-white" />
                    </div>
                    <h1 className="font-bold text-lg text-slate-900">{t('admin.dashboard')}</h1>
                </div>
                {/* Tabs */}
                <div className="flex gap-4 mb-8">
                    <button
                        onClick={() => setActiveTab('config')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
                            activeTab === 'config'
                                ? "bg-blue-600/10 border-blue-600/20 text-blue-400"
                                : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                        )}
                    >
                        <Settings className="w-4 h-4" />
                        {t('admin.tab.config')}
                    </button>
                    <button
                        onClick={() => setActiveTab('logs')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
                            activeTab === 'logs'
                                ? "bg-blue-600/10 border-blue-600/20 text-blue-400"
                                : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                        )}
                    >
                        <FileText className="w-4 h-4" />
                        {t('admin.tab.logs')}
                    </button>
                    <button
                        onClick={() => setActiveTab('surveys')}
                        className={cn(
                            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border",
                            activeTab === 'surveys'
                                ? "bg-blue-600/10 border-blue-600/20 text-blue-400"
                                : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                        )}
                    >
                        <ClipboardList className="w-4 h-4" />
                        {t('admin.tab.surveys')}
                    </button>
                </div>

                {/* Content */}
                <div className="animate-fade-in-up">
                    {activeTab === 'config' && <ConfigForm />}
                    {activeTab === 'logs' && <LogViewer />}
                    {activeTab === 'surveys' && <SurveyViewer />}
                </div>
            </section>
        </div>
    );
}
