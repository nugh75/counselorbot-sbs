'use client';

import { useEffect, useRef } from 'react';
import ToolIllustration from '@/components/ui/ToolIllustration';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { personalAreaDescription, personalAreaName, personalAreaText } from '@/lib/i18n-personal-area';
import { personalAreaIllustrations, type PersonalAreaSlug } from '@/lib/personal-area';
import { personalSlugEnabled, personalToolAccessText } from '@/lib/personal-tool-access';
import { usePersonalToolAccess } from '@/lib/use-personal-tool-access';
import { Callout } from '@/components/ui/Callout';
import { AreaBreadcrumbs } from '@/components/ui/AreaBreadcrumbs';
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
            <AreaBreadcrumbs
                ariaLabel={l('breadcrumbs')}
                items={[{ label: l('title'), href: '/profilo' }, { label: personalAreaName(lang, slug), current: true }]}
                extra={<Link href="/privacy" className={control}><ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />{t('privacy.title')}</Link>}
            />
            <PageHeader
                headingRef={heading}
                title={personalAreaName(lang, slug)}
                subtitle={personalAreaDescription(lang, slug)}
                icon={<ToolIllustration id={personalAreaIllustrations[slug]} className="h-16 w-16 shrink-0 object-contain sm:h-18 sm:w-18" />}
            />
            {!personalSlugEnabled(access, slug) && <Callout title={personalToolAccessText(lang, 'disabledTitle')}>
                {personalToolAccessText(lang, 'disabledBody')}
            </Callout>}
        </header>
    );
}
