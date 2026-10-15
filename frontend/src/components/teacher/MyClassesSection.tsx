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
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
                <div>
                    <h2 id="teacher-my-classes-heading" className="text-lg font-bold text-slate-800">
                        {l('myClassesTitle')}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                        {l('myClassesSubtitle')}
                    </p>
                </div>
                <Link
                    href="/docente/classi"
                    data-testid="my-classes-manage-all-link"
                    className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-indigo-700 underline-offset-4 hover:underline"
                >
                    <span>{l('myClassesManageAll')}</span>
                    <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
            </div>

            {loading && (
                <div role="status" aria-label={l('myClassesLoading')} data-testid="my-classes-loading" className="mt-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {[1, 2, 3].map(index => (
                            <div key={index} className="animate-pulse rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
                                <div className="flex items-center justify-between">
                                    <div className="h-10 w-10 rounded-lg bg-slate-200" />
                                    <div className="h-5 w-20 rounded bg-slate-200" />
                                </div>
                                <div className="mt-4 h-5 w-3/4 rounded bg-slate-200" />
                                <div className="mt-2 h-4 w-1/2 rounded bg-slate-200" />
                                <div className="mt-5 border-t border-slate-100 pt-3">
                                    <div className="h-9 w-full rounded bg-slate-200" />
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
                    className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-dashed border-indigo-200 bg-gradient-to-br from-indigo-50/50 via-white to-sky-50/30 p-8 text-center"
                >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 shadow-xs">
                        <GraduationCap className="h-6 w-6" aria-hidden />
                    </div>
                    <h3 className="mt-3 text-base font-bold text-slate-900">
                        {l('myClassesEmptyTitle')}
                    </h3>
                    <p className="mt-1 max-w-md text-sm leading-relaxed text-slate-600">
                        {l('myClassesEmptyDescription')}
                    </p>
                    <div className="mt-4">
                        <Link
                            href="/docente/classi"
                            data-testid="my-classes-create-first-cta"
                            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
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
                                className="group flex flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-4 shadow-xs transition hover:border-indigo-300 hover:shadow-md"
                            >
                                <div className="min-w-0">
                                    {/* Copertina 16:9 in stile counselor */}
                                    <div className="relative mb-3 aspect-[16/9] max-h-28 w-full overflow-hidden rounded-lg border border-slate-200/80 bg-slate-100 shadow-xs group/cover">
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
                                            className="absolute inset-0 flex items-center justify-center bg-slate-900/40 opacity-0 backdrop-blur-[2px] transition duration-200 group-hover/cover:opacity-100 focus-visible:opacity-100 cursor-pointer"
                                        >
                                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/95 px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-white hover:text-indigo-700">
                                                <Pencil className="h-3.5 w-3.5" aria-hidden />
                                                <span>{l('classCoverChange')}</span>
                                            </span>
                                        </button>
                                    </div>

                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 transition-colors group-hover:bg-indigo-100">
                                            <Users className="h-4.5 w-4.5" aria-hidden />
                                        </div>
                                        {group.code && (
                                            <span
                                                className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-600"
                                                title={l('myClassesInviteCode')}
                                            >
                                                <KeyRound className="h-3 w-3 text-slate-400" aria-hidden />
                                                <span>{group.code}</span>
                                            </span>
                                        )}
                                    </div>

                                    <h3 className="mt-2.5 truncate text-base font-bold text-slate-900 group-hover:text-indigo-700" title={group.name}>
                                        {group.name}
                                    </h3>

                                    <div className="mt-1.5 space-y-1 text-xs text-slate-600">
                                        <p className="flex items-center gap-1.5 font-medium">
                                            <span className="font-semibold text-slate-700">{studentCountText}</span>
                                        </p>
                                        {institutionOrSchool && (
                                            <p className="flex items-center gap-1.5 truncate text-slate-500" title={institutionOrSchool}>
                                                <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                                                <span className="truncate">{institutionOrSchool}</span>
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-4 border-t border-slate-100 pt-3">
                                    <Link
                                        href={`/docente/classi/${group.id}`}
                                        data-testid={`my-class-hub-link-${group.id}`}
                                        className="inline-flex min-h-[44px] w-full items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50 hover:text-indigo-800"
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
