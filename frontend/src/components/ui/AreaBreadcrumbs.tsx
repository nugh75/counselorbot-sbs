'use client';

import Link from 'next/link';
import { ArrowLeft, ChevronRight } from 'lucide-react';

export interface AreaBreadcrumbItem {
    label: string;
    href?: string;
    current?: boolean;
}

export interface AreaBreadcrumbsProps {
    items: AreaBreadcrumbItem[];
    ariaLabel: string;
    testId?: string;
    extra?: React.ReactNode;
    className?: string;
}

/**
 * Breadcrumb condiviso dalle aree docente e studente: <nav>, <ol>, aria-current="page", target >= 44px.
 */
export function AreaBreadcrumbs({ items, ariaLabel, testId = 'area-breadcrumbs', extra, className = '' }: AreaBreadcrumbsProps) {
    if (!items || items.length === 0) return null;

    return (
        <nav
            aria-label={ariaLabel}
            data-testid={testId}
            className={`flex flex-wrap items-center justify-between gap-4 text-sm ${className}`}
        >
            <ol className="flex flex-wrap items-center gap-1 text-ink-muted">
                {items.map((item, index) => {
                    const isFirst = index === 0;
                    const isLast = index === items.length - 1;
                    const isCurrent = item.current ?? isLast;

                    return (
                        <li key={index} className="inline-flex items-center gap-1">
                            {!isFirst && (
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
                            )}
                            {item.href && !isCurrent ? (
                                <Link
                                    href={item.href}
                                    data-testid={isFirst ? 'breadcrumb-root-link' : `breadcrumb-link-${index}`}
                                    className="inline-flex min-h-control items-center gap-2 rounded-control px-2 text-ink-muted transition-colors hover:bg-surface-raised hover:text-link focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                                >
                                    {isFirst && <ArrowLeft className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />}
                                    <span>{item.label}</span>
                                </Link>
                            ) : (
                                <span
                                    aria-current="page"
                                    data-testid={`breadcrumb-current-${index}`}
                                    className="inline-flex min-h-control items-center px-2 font-semibold text-ink"
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
