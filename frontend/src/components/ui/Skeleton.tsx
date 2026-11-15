import { cn } from '@/lib/utils';

// Placeholder di caricamento: anticipa la forma del contenuto, così la pagina non "salta"
// quando arriva. Colori dai token, nessun `dark:` al punto d'uso.
export function Skeleton({ className }: { className?: string }) {
    return <div aria-hidden="true" className={cn('animate-pulse rounded-control bg-surface-raised', className)} />;
}

const TEXT_WIDTHS = ['w-full', 'w-5/6', 'w-2/3'];

/** `lines` bars of body text, the last ones shorter. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
    return (
        <div className={cn('space-y-2', className)} aria-hidden="true">
            {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className={cn('h-3', TEXT_WIDTHS[i % TEXT_WIDTHS.length])} />)}
        </div>
    );
}

const ROW_WIDTHS = [['w-1/2', 'w-4/5'], ['w-2/5', 'w-3/4'], ['w-3/5', 'w-2/3']];

/** Rows shaped like `EntryLink`: 40px tile plus a title line and a description line. */
export function SkeletonEntryList({ rows = 3, label, className }: { rows?: number; label?: string; className?: string }) {
    return (
        <div role="status" aria-busy="true" aria-label={label} className={className}>
            {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="flex min-h-14 items-center gap-3 border-b border-line py-2">
                    <Skeleton className="h-10 w-10 shrink-0" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className={cn('h-3', ROW_WIDTHS[i % ROW_WIDTHS.length][0])} />
                        <Skeleton className={cn('h-2.5', ROW_WIDTHS[i % ROW_WIDTHS.length][1])} />
                    </div>
                </div>
            ))}
        </div>
    );
}
