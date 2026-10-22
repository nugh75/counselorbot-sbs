'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { classPathText } from '@/lib/i18n-class-paths';
import { orderClassPaths, type StudentClassPath } from '@/lib/class-paths';
import { ClassPathHeroCard } from '@/components/profile/ClassPathHeroCard';

// Every published plan of the student: the priority one open, the others folded.
export function ClassPathHeroList({ paths, onReload }: { paths: StudentClassPath[]; onReload?: () => Promise<void> | void }) {
    const { lang } = useI18n();
    const ordered = orderClassPaths(paths);
    return (
        <div data-testid="class-path-hero-list" className="space-y-3">
            {ordered.map((path, index) => (
                <ClassPathHeroCard
                    key={path.id}
                    path={path}
                    onReload={onReload}
                    collapsible={ordered.length > 1}
                    defaultOpen={index === 0}
                />
            ))}
            <div className="flex items-center justify-end">
                <Link
                    href="/profilo/piani-operativi"
                    className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-indigo-700 transition-colors hover:text-indigo-900 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                    <span>
                        {ordered.length > 1
                            ? `${classPathText(lang, 'seeAllClassPaths')} (${ordered.length})`
                            : classPathText(lang, 'seeAllClassPaths')}
                    </span>
                    <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
            </div>
        </div>
    );
}
