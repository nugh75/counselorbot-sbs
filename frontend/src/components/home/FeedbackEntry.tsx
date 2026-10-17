'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';

// Questionario di gradimento: per tutti, anche anonimi (prima stava nella barra).
export function FeedbackEntry({ className = '' }: { className?: string }) {
    const { t } = useI18n();
    return (
        <Link href="/questionario" className={`group flex min-w-0 items-center gap-4 rounded-xl border border-indigo-200 bg-indigo-50 p-5 text-left hover:shadow-sm dark:border-indigo-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600 ${className}`}>
            <Image
                src="/images/intro/feedback.png"
                alt=""
                width={96}
                height={96}
                sizes="(min-width: 640px) 96px, 64px"
                className="h-16 w-16 shrink-0 object-contain sm:h-24 sm:w-24"
            />
            <span className="min-w-0 grow">
                <span className="font-display block break-words text-lg font-semibold text-slate-900">{t('app.intro.feedback.title')}</span>
                <span className="mt-1 block break-words text-sm leading-relaxed text-slate-600">{t('app.intro.feedback.body')}</span>
            </span>
            <ArrowRight aria-hidden="true" className="h-5 w-5 shrink-0 text-indigo-700 group-hover:translate-x-0.5" />
        </Link>
    );
}
