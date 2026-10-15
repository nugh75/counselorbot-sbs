'use client';

import Link from 'next/link';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { teacherAreaText } from '@/lib/i18n-teacher-area';
import type { TeacherBreadcrumbItem } from '@/lib/teacher-breadcrumbs';

export interface TeacherBreadcrumbsProps {
    items: TeacherBreadcrumbItem[];
    extra?: React.ReactNode;
    className?: string;
}

/**
 * Componente breadcrumb per l'Area Docente con navigazione secondaria gerarchica,
 * accessibilità semantica completa (<nav>, <ol>, <li>, aria-current="page") e touch target >= 44px.
 */
export function TeacherBreadcrumbs({ items, extra, className = '' }: TeacherBreadcrumbsProps) {
    const { lang } = useI18n();

    if (!items || items.length === 0) return null;

    return (
        <nav
            aria-label={teacherAreaText(lang, 'breadcrumbsAriaLabel')}
            data-testid="teacher-breadcrumbs"
            className={`flex flex-wrap items-center justify-between gap-3 text-sm ${className}`}
        >
            <ol className="flex flex-wrap items-center gap-1 text-slate-600">
                {items.map((item, index) => {
                    const isFirst = index === 0;
                    const isLast = index === items.length - 1;
                    const isCurrent = item.current ?? isLast;

                    return (
                        <li key={index} className="inline-flex items-center gap-1">
                            {!isFirst && (
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                            )}
                            {item.href && !isCurrent ? (
                                <Link
                                    href={item.href}
                                    data-testid={isFirst ? 'breadcrumb-root-link' : `breadcrumb-link-${index}`}
                                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 dark:hover:bg-slate-800"
                                >
                                    {isFirst && <ArrowLeft className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
                                    <span>{item.label}</span>
                                </Link>
                            ) : (
                                <span
                                    aria-current="page"
                                    data-testid={`breadcrumb-current-${index}`}
                                    className="inline-flex min-h-[44px] items-center px-2 font-bold text-slate-900"
                                >
                                    {item.label}
                                </span>
                            )}
                        </li>
                    );
                })}
            </ol>
            {extra && <div className="flex items-center" data-testid="breadcrumb-extra">{extra}</div>}
        </nav>
    );
}
