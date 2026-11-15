import type { ReactNode } from 'react';
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
            <nav aria-labelledby={id} className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 md:grid-cols-2">{children}</nav>
        </section>
    );
}

// `illustration` is the sized picture on the left (e.g. a ToolIllustration); `status` is a small line
// under the description; `reload` uses a plain anchor for pages that read state on mount.
export function EntryLink({ idPrefix, id, href, illustration, name, description, badge, status, reload, testId, onOpen }: {
    idPrefix: string; id: string; href: string; illustration?: ReactNode; name: string; description: string;
    badge?: ReactNode; status?: ReactNode; reload?: boolean; testId?: string; onOpen?: () => void;
}) {
    const className = 'group flex min-h-24 items-center gap-4 border-b border-transparent px-2 py-4 transition-colors hover:border-line sm:gap-4';
    const content = <>
        {illustration}
        <span className="min-w-0 flex-1 break-words">
            <span id={`${idPrefix}-link-${id}`} className="flex flex-wrap items-center gap-2 font-semibold text-ink group-hover:text-link">
                <span>{name}</span>
                {badge}
            </span>
            <span id={`${idPrefix}-description-${id}`} className="mt-1 block text-sm leading-relaxed text-ink-muted">{description}</span>
            {status && <span className="mt-1 flex items-center gap-2 text-xs text-ink-muted" data-entry-status>
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-brand" />{status}
            </span>}
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
    </>;
    const labels = { 'aria-labelledby': `${idPrefix}-link-${id}`, 'aria-describedby': `${idPrefix}-description-${id}` };
    if (onOpen) return <button type="button" onClick={onOpen} {...labels} className={`${className} w-full text-left`} data-testid={testId}>{content}</button>;
    return reload
        ? <a href={href} {...labels} className={className} data-testid={testId}>{content}</a>
        : <Link href={href} {...labels} className={className} data-testid={testId}>{content}</Link>;
}
