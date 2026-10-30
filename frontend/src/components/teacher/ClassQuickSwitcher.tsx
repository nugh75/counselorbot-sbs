'use client';

import { useRouter } from 'next/navigation';
import { Users, ChevronDown } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { teacherAreaText } from '@/lib/i18n-teacher-area';
import { computeClassSwitchUrl, getActiveSwitchGroups } from '@/lib/teacher-quick-switcher';
import type { StudentGroup } from './class-group-types';

export interface ClassQuickSwitcherProps {
    currentGroupId: number;
    groups?: StudentGroup[];
    currentTab?: string;
    basePath?: string;
    className?: string;
}

/**
 * Quick class switcher: consente al docente o all'admin di passare direttamente
 * a un'altra classe dalle viste contestuali di classe (/docente/classi/[id] o /admin/classi/[id]),
 * preservando l'eventuale tab attivo e rispettando i target touch >= 44px.
 */
export function ClassQuickSwitcher({
    currentGroupId,
    groups,
    currentTab,
    basePath,
    className = '',
}: ClassQuickSwitcherProps) {
    const router = useRouter();
    const { lang } = useI18n();

    const activeGroups = getActiveSwitchGroups(groups);
    if (activeGroups.length === 0) return null;

    const handleChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const targetId = Number(event.target.value);
        if (targetId && targetId !== currentGroupId) {
            router.push(computeClassSwitchUrl(targetId, currentTab, basePath));
        }
    };

    const hasMultiple = activeGroups.length > 1;

    return (
        <div
            data-testid="quick-class-switcher"
            className={`flex items-center gap-2 ${className}`}
        >
            <label htmlFor="quick-class-select" className="sr-only">
                {teacherAreaText(lang, 'quickClassSwitcherAriaLabel')}
            </label>
            <div className="relative inline-flex items-center">
                <Users className="pointer-events-none absolute left-2.5 h-4 w-4 text-ink-muted" aria-hidden="true" />
                <select
                    id="quick-class-select"
                    aria-label={teacherAreaText(lang, 'quickClassSwitcherAriaLabel')}
                    value={currentGroupId}
                    disabled={!hasMultiple}
                    onChange={handleChange}
                    className="min-h-[44px] appearance-none rounded-lg border border-line-strong bg-surface py-2 pl-8 pr-8 text-xs font-semibold text-ink-body shadow-card transition hover:border-brand focus:border-brand focus:outline-none focus:ring-2 focus:ring-focus/20 disabled:cursor-default disabled:opacity-80"
                >
                    {activeGroups.map(group => (
                        <option key={group.id} value={group.id}>
                            {group.name}
                        </option>
                    ))}
                </select>
                {hasMultiple && (
                    <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-ink-muted" aria-hidden="true" />
                )}
            </div>
        </div>
    );
}
