'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Users, ArrowRight, GraduationCap, Building2, KeyRound, Plus, RefreshCw, Pencil } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { teacherAreaText } from '@/lib/i18n-teacher-area';
import { useTeacherResource } from './useTeacherResource';
import { parseClassGroups, type StudentGroup } from './class-group-types';
import { getClassCoverUrl } from '@/lib/class-cover-presets';
import { ClassImageModal } from './ClassImageModal';
import { Callout } from '@/components/ui/Callout';
import { Button } from '@/components/ui/Button';

export function MyClassesSection() {
    const { lang } = useI18n();
    const l = (key: Parameters<typeof teacherAreaText>[1]) => teacherAreaText(lang, key);
    const { data: groups, loading, failed, forbidden, reload } = useTeacherResource('/api/admin/groups', parseClassGroups);
    const [editingCoverGroup, setEditingCoverGroup] = useState<StudentGroup | null>(null);

    const activeGroups = (groups ?? []).filter(group => group.is_active);

    return (
        <section aria-labelledby="teacher-my-classes-heading" data-testid="teacher-my-classes-section">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-2">
                <div>
                    <h2 id="teacher-my-classes-heading" className="text-lg font-semibold text-ink">
                        {l('myClassesTitle')}
                    </h2>
                    <p className="mt-1 text-xs text-ink-muted">
                        {l('myClassesSubtitle')}
                    </p>
                </div>
                <Link
                    href="/docente/classi"
                    data-testid="my-classes-manage-all-link"
                    className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-link underline-offset-4 hover:underline"
                >
                    <span>{l('myClassesManageAll')}</span>
                    <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
            </div>

            {loading && (
                <div role="status" aria-label={l('myClassesLoading')} data-testid="my-classes-loading" className="mt-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {[1, 2, 3].map(index => (
                            <div key={index} className="animate-pulse rounded-card border border-line bg-surface p-6 shadow-card">
                                <div className="flex items-center justify-between">
                                    <div className="h-10 w-10 rounded-lg bg-line" />
                                    <div className="h-5 w-20 rounded bg-line" />
                                </div>
                                <div className="mt-4 h-5 w-3/4 rounded bg-line" />
                                <div className="mt-2 h-4 w-1/2 rounded bg-line" />
                                <div className="mt-6 border-t border-line pt-4">
                                    <div className="h-9 w-full rounded bg-line" />
                                </div>
                            </div>
                        ))}
                    </div>
                    <span className="sr-only">{l('myClassesLoading')}</span>
                </div>
            )}

            {!loading && forbidden && (
                <div className="mt-4">
                    <Callout variant="danger">{l('forbidden')}</Callout>
                </div>
            )}

            {!loading && !forbidden && failed && (
                <div className="mt-4">
                    <Callout variant="danger" title={l('myClassesError')}>
                        <div className="mt-2">
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={() => void reload()}
                                className="inline-flex min-h-[44px] items-center gap-2"
                            >
                                <RefreshCw className="h-4 w-4" aria-hidden />
                                <span>{l('myClassesRetry')}</span>
                            </Button>
                        </div>
                    </Callout>
                </div>
            )}

            {!loading && !forbidden && !failed && activeGroups.length === 0 && (
                <div
                    data-testid="my-classes-zero-state"
                    className="mt-4 flex flex-col items-center justify-center rounded-card border border-dashed border-brand-line bg-brand-soft p-8 text-center"
                >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-soft text-link shadow-card">
                        <GraduationCap className="h-6 w-6" aria-hidden />
                    </div>
                    <h3 className="mt-4 text-base font-semibold text-ink">
                        {l('myClassesEmptyTitle')}
                    </h3>
                    <p className="mt-1 max-w-md text-sm leading-relaxed text-ink-muted">
                        {l('myClassesEmptyDescription')}
                    </p>
                    <div className="mt-4">
                        <Link
                            href="/docente/classi"
                            data-testid="my-classes-create-first-cta"
                            className="inline-flex min-h-[44px] items-center gap-2 rounded-control bg-brand px-4 py-2 text-sm font-semibold text-ink-on-brand shadow-card transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                        >
                            <Plus className="h-4 w-4" aria-hidden />
                            <span>{l('myClassesCreateFirst')}</span>
                        </Link>
                    </div>
                </div>
            )}

            {!loading && !forbidden && !failed && activeGroups.length > 0 && (
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="my-classes-grid">
                    {activeGroups.map(group => {
                        const studentCountText = `${group.members_count} ${group.members_count === 1 ? l('myClassesStudentSingle') : l('myClassesStudents')}`;
                        const institutionOrSchool = group.institution_name || group.school;
                        return (
                            <div
                                key={group.id}
                                data-testid={`my-class-card-${group.id}`}
                                className="group flex flex-col justify-between rounded-card border border-line/90 bg-surface p-4 shadow-card transition hover:border-brand-line hover:shadow-card"
                            >
                                <div className="min-w-0">
                                    {/* Copertina 16:9 in stile counselor */}
                                    <div className="relative mb-4 aspect-[16/9] max-h-28 w-full overflow-hidden rounded-lg border border-line/80 bg-surface-raised shadow-card group/cover">
                                        <Image
                                            src={getClassCoverUrl(group)}
                                            alt={group.name}
                                            fill
                                            unoptimized
                                            className="object-cover transition duration-300 group-hover/cover:scale-105"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setEditingCoverGroup(group)}
                                            title={l('classCoverChange')}
                                            className="absolute inset-0 flex items-center justify-center bg-slate-900/40 opacity-0 transition duration-200 group-hover/cover:opacity-100 focus-visible:opacity-100 cursor-pointer"
                                        >
                                            <span className="inline-flex items-center gap-2 rounded-lg bg-surface/95 px-2 py-1 text-xs font-semibold text-ink shadow-card transition hover:bg-surface hover:text-link">
                                                <Pencil className="h-3.5 w-3.5" aria-hidden />
                                                <span>{l('classCoverChange')}</span>
                                            </span>
                                        </button>
                                    </div>

                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-link transition-colors group-hover:bg-brand-soft">
                                            <Users className="h-4.5 w-4.5" aria-hidden />
                                        </div>
                                        {group.code && (
                                            <span
                                                className="inline-flex items-center gap-1 rounded-control bg-surface-raised px-2 py-1 font-mono text-xs font-semibold text-ink-muted"
                                                title={l('myClassesInviteCode')}
                                            >
                                                <KeyRound className="h-3 w-3 text-ink-muted" aria-hidden />
                                                <span>{group.code}</span>
                                            </span>
                                        )}
                                    </div>

                                    <h3 className="mt-2 truncate text-base font-semibold text-ink group-hover:text-link" title={group.name}>
                                        {group.name}
                                    </h3>

                                    <div className="mt-2 space-y-1 text-xs text-ink-muted">
                                        <p className="flex items-center gap-2 font-semibold">
                                            <span className="font-semibold text-ink-body">{studentCountText}</span>
                                        </p>
                                        {institutionOrSchool && (
                                            <p className="flex items-center gap-2 truncate text-ink-muted" title={institutionOrSchool}>
                                                <Building2 className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />
                                                <span className="truncate">{institutionOrSchool}</span>
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-4 border-t border-line pt-4">
                                    <Link
                                        href={`/docente/classi/${group.id}`}
                                        data-testid={`my-class-hub-link-${group.id}`}
                                        className="inline-flex min-h-[44px] w-full items-center justify-between rounded-lg bg-surface-sunken px-4 py-2 text-sm font-semibold text-link transition hover:bg-brand-soft hover:text-link"
                                    >
                                        <span>{l('myClassesOpenHub')}</span>
                                        <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
                                    </Link>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {editingCoverGroup && (
                <ClassImageModal
                    open={Boolean(editingCoverGroup)}
                    group={editingCoverGroup}
                    onClose={() => setEditingCoverGroup(null)}
                    onUpdated={(updatedGroup) => {
                        setEditingCoverGroup(null);
                        void reload();
                    }}
                />
            )}
        </section>
    );
}
