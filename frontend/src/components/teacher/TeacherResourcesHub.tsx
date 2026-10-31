'use client';

import { useState } from 'react';
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

    const tabParam = searchParams?.get('tab') ?? null;
    const [seenTabParam, setSeenTabParam] = useState(tabParam);
    if (seenTabParam !== tabParam) {
        setSeenTabParam(tabParam);
        if (tabParam === 'materiali' || tabParam === 'strategie') setActiveTab(tabParam);
    }

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
            <div className="rounded-card border border-brand-line bg-brand-soft p-4 sm:p-6 shadow-card">
                <div className="flex items-start gap-4 sm:gap-4">
                    <div className="rounded-card bg-brand/10 p-2 text-link">
                        <Library className="h-6 w-6" aria-hidden />
                    </div>
                    <div className="space-y-1">
                        <h2 className="text-base font-semibold text-ink sm:text-lg">
                            {l('resources')}
                        </h2>
                        <p className="text-xs leading-relaxed text-ink-muted sm:text-sm">
                            {l('resourcesHubDescription')}
                        </p>
                    </div>
                </div>
            </div>

            {/* Tab navigation */}
            <div className="border-b border-line" role="tablist" aria-label={l('resources')}>
                <div className="flex flex-wrap gap-2 sm:gap-4">
                    <button
                        type="button"
                        role="tab"
                        id="tab-btn-strategie"
                        aria-controls="tabpanel-strategie"
                        aria-selected={activeTab === 'strategie'}
                        data-testid="tab-strategie"
                        onClick={() => handleTabChange('strategie')}
                        className={`inline-flex min-h-[44px] items-center gap-2 rounded-t-xl px-4 py-2 text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                            activeTab === 'strategie'
                                ? 'border-b-2 border-brand bg-surface text-link shadow-card'
                                : 'text-ink-muted hover:bg-surface-raised hover:text-ink'
                        }`}
                    >
                        <Sparkles className={`h-4 w-4 shrink-0 ${activeTab === 'strategie' ? 'text-link' : 'text-ink-muted'}`} aria-hidden />
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
                        className={`inline-flex min-h-[44px] items-center gap-2 rounded-t-xl px-4 py-2 text-sm font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                            activeTab === 'materiali'
                                ? 'border-b-2 border-brand bg-surface text-link shadow-card'
                                : 'text-ink-muted hover:bg-surface-raised hover:text-ink'
                        }`}
                    >
                        <BookOpen className={`h-4 w-4 shrink-0 ${activeTab === 'materiali' ? 'text-link' : 'text-ink-muted'}`} aria-hidden />
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
