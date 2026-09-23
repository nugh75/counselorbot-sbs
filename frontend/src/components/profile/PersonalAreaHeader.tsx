'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { personalAreaDescription, personalAreaName, personalAreaText } from '@/lib/i18n-personal-area';
import { personalAreaImages, type PersonalAreaSlug } from '@/lib/personal-area';

// First used by Orientamento. Editable pages need their exit guards before adoption.
export function PersonalAreaHeader({ slug }: { slug: PersonalAreaSlug }) {
    const { lang } = useI18n();
    const heading = useRef<HTMLHeadingElement>(null);
    const l = (key: Parameters<typeof personalAreaText>[1]) => personalAreaText(lang, key);
    const control = 'inline-flex min-h-[44px] items-center gap-2 rounded-lg px-3 text-sm font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 dark:hover:bg-slate-800';

    useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [slug]);

    return (
        <header data-personal-area-header className="space-y-5">
            <div className="flex items-center">
                <Link href="/profilo" className={control}><ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />{l('title')}</Link>
            </div>
            <div className="grid grid-cols-[4rem_1fr] items-center gap-x-4 gap-y-3 sm:grid-cols-[4.5rem_1fr]">
                <Image src={personalAreaImages[slug]} alt="" width={72} height={72} className="h-16 w-16 object-contain sm:row-span-2 sm:h-18 sm:w-18" />
                <h1 ref={heading} tabIndex={-1} className="text-2xl font-bold tracking-tight focus:outline-none sm:self-end">{personalAreaName(lang, slug)}</h1>
                <p className="col-span-2 text-sm text-slate-600 sm:col-span-1 sm:self-start dark:text-slate-400">{personalAreaDescription(lang, slug)}</p>
            </div>
        </header>
    );
}
