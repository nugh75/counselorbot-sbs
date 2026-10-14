'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { BookOpen, Sparkles, Library } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { teacherAreaText } from '@/lib/i18n-teacher-area';
import { CertifiedStrategiesPanel } from '@/components/admin/CertifiedStrategiesPanel';
import { CertifiedReadingsPanel } from '@/components/admin/CertifiedReadingsPanel';

export type ResourcesTab = 'strategie' | 'materiali';

export function TeacherResourcesHub({ defaultTab }: { defaultTab?: ResourcesTab }) {
    const { lang } = useI18n();
    const searchParams = useSearchParams();
    const l = (key: Parameters<typeof teacherAreaText>[1]) => teacherAreaText(lang, key);

    const initialTab: ResourcesTab = (() => {
        const param = searchParams?.get('tab');
        if (param === 'materiali' || param === 'strategie') return param;
        return defaultTab || 'strategie';
    })();

    const [activeTab, setActiveTab] = useState<ResourcesTab>(initialTab);

    useEffect(() => {
        const param = searchParams?.get('tab');
        if (param === 'materiali' || param === 'strategie') {
            setActiveTab(param);
        }
    }, [searchParams]);

    const handleTabChange = (tab: ResourcesTab) => {
        setActiveTab(tab);
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.set('tab', tab);
            window.history.replaceState({}, '', url.toString());
        }
    };

    return (
        <div className="space-y-6" data-testid="teacher-resources-hub">
            <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-sky-50/40 to-white p-4 sm:p-5 shadow-xs">
                <div className="flex items-start gap-3 sm:gap-4">
                    <div className="rounded-xl bg-indigo-600/10 p-2.5 text-indigo-700">
                        <Library className="h-6 w-6" aria-hidden />
                    </div>
                    <div className="space-y-1">
                        <h2 className="text-base font-bold text-slate-900 sm:text-lg">
                            {l('resources')}
                        </h2>
                        <p className="text-xs leading-relaxed text-slate-600 sm:text-sm">
                            {l('resourcesHubDescription')}
                        </p>
                    </div>
                </div>
            </div>

            {/* Tab navigation */}
            <div className="border-b border-slate-200" role="tablist" aria-label={l('resources')}>
                <div className="flex flex-wrap gap-2 sm:gap-3">
                    <button
                        type="button"
                        role="tab"
                        id="tab-btn-strategie"
                        aria-controls="tabpanel-strategie"
                        aria-selected={activeTab === 'strategie'}
                        data-testid="tab-strategie"
                        onClick={() => handleTabChange('strategie')}
                        className={`inline-flex min-h-[44px] items-center gap-2 rounded-t-xl px-4 py-2.5 text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${
                            activeTab === 'strategie'
                                ? 'border-b-2 border-indigo-600 bg-white text-indigo-700 shadow-xs'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                    >
                        <Sparkles className={`h-4 w-4 shrink-0 ${activeTab === 'strategie' ? 'text-indigo-600' : 'text-slate-400'}`} aria-hidden />
                        <span>{l('resourcesTabStrategies')}</span>
                    </button>

                    <button
                        type="button"
                        role="tab"
                        id="tab-btn-materiali"
                        aria-controls="tabpanel-materiali"
                        aria-selected={activeTab === 'materiali'}
                        data-testid="tab-materiali"
                        onClick={() => handleTabChange('materiali')}
                        className={`inline-flex min-h-[44px] items-center gap-2 rounded-t-xl px-4 py-2.5 text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${
                            activeTab === 'materiali'
                                ? 'border-b-2 border-indigo-600 bg-white text-indigo-700 shadow-xs'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                    >
                        <BookOpen className={`h-4 w-4 shrink-0 ${activeTab === 'materiali' ? 'text-indigo-600' : 'text-slate-400'}`} aria-hidden />
                        <span>{l('resourcesTabMaterials')}</span>
                    </button>
                </div>
            </div>

            {/* Tab contents */}
            <div
                id="tabpanel-strategie"
                role="tabpanel"
                aria-labelledby="tab-btn-strategie"
                hidden={activeTab !== 'strategie'}
            >
                {activeTab === 'strategie' && <CertifiedStrategiesPanel />}
            </div>

            <div
                id="tabpanel-materiali"
                role="tabpanel"
                aria-labelledby="tab-btn-materiali"
                hidden={activeTab !== 'materiali'}
            >
                {activeTab === 'materiali' && <CertifiedReadingsPanel />}
            </div>
        </div>
    );
}
