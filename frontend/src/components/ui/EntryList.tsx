import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

// Flat entry list shared by the area pages: section heading with a bottom rule,
// then a two-column grid of illustrated links (title, description, optional badge, arrow).
export function EntrySection({ id, title, subtitle, testId, children }: {
    id: string; title: string; subtitle?: string; testId?: string; children: ReactNode;
}) {
    const heading = <h2 id={id} className={`${subtitle ? '' : 'border-b border-line pb-2 '}text-lg font-semibold text-ink`}>{title}</h2>;
    return (
        <section aria-labelledby={id} data-testid={testId}>
            {subtitle
                ? <div className="border-b border-line pb-2">{heading}<p className="mt-1 text-xs text-ink-muted">{subtitle}</p></div>
                : heading}
            <nav aria-labelledby={id} className="mt-2 grid gap-x-6 gap-y-1 md:grid-cols-2">{children}</nav>
        </section>
    );
}

export function EntryLink({ idPrefix, id, href, image, illustration, name, description, badge }: {
    idPrefix: string; id: string; href: string; image?: string; illustration?: ReactNode; name: string; description: string; badge?: ReactNode;
}) {
    return (
        <Link href={href} aria-labelledby={`${idPrefix}-link-${id}`} aria-describedby={`${idPrefix}-description-${id}`}
            className="group flex min-h-24 items-center gap-4 rounded-card px-2 py-4 transition-colors hover:bg-surface-sunken sm:gap-4">
            {illustration ?? (image && <Image src={image} alt="" width={72} height={72} sizes="(min-width: 768px) 72px, 64px" className="h-16 w-16 shrink-0 rounded-control object-contain md:h-18 md:w-18" />)}
            <span className="min-w-0 flex-1 break-words">
                <span id={`${idPrefix}-link-${id}`} className="flex items-center gap-2 font-semibold text-ink group-hover:text-link">
                    <span>{name}</span>
                    {badge}
                </span>
                <span id={`${idPrefix}-description-${id}`} className="mt-1 block text-sm leading-relaxed text-ink-muted">{description}</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
        </Link>
    );
}
