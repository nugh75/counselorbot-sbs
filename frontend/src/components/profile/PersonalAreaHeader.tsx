'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { personalAreaDescription, personalAreaName, personalAreaText } from '@/lib/i18n-personal-area';
import { personalAreaImages, type PersonalAreaSlug } from '@/lib/personal-area';
import { personalSlugEnabled, personalToolAccessText } from '@/lib/personal-tool-access';
import { usePersonalToolAccess } from '@/lib/use-personal-tool-access';
import { Callout } from '@/components/ui/Callout';
import { PageHeader } from '@/components/ui/PageHeader';

// Used by Orientamento and Obiettivi. Editable pages need their exit guards before adoption.
export function PersonalAreaHeader({ slug }: { slug: PersonalAreaSlug }) {
    const { lang, t } = useI18n();
    const heading = useRef<HTMLHeadingElement>(null);
    const access = usePersonalToolAccess();
    const l = (key: Parameters<typeof personalAreaText>[1]) => personalAreaText(lang, key);
    const control = 'inline-flex min-h-control items-center gap-2 rounded-control px-4 text-sm hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus';

    useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [slug]);

    return (
        <header data-personal-area-header className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href="/profilo" className={control}><ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />{l('title')}</Link>
                <Link href="/privacy" className={control}><ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />{t('privacy.title')}</Link>
            </div>
            <PageHeader
                headingRef={heading}
                title={personalAreaName(lang, slug)}
                subtitle={personalAreaDescription(lang, slug)}
                icon={<Image src={personalAreaImages[slug]} alt="" width={72} height={72} className="h-16 w-16 shrink-0 object-contain sm:h-18 sm:w-18" />}
            />
            {!personalSlugEnabled(access, slug) && <Callout title={personalToolAccessText(lang, 'disabledTitle')}>
                {personalToolAccessText(lang, 'disabledBody')}
            </Callout>}
        </header>
    );
}
