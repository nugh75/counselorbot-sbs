import { cn } from '@/lib/utils';

/** Three pulsing dots: the counselor is replying. The only chat waiting mark. */
export function TypingDots({ className }: { className?: string }) {
    return (
        <span aria-hidden="true" className={cn('inline-flex items-center gap-1', className)}>
            {[0, 1, 2].map(i => (
                <i key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-ink-muted" style={{ animationDelay: `${i * 200}ms` }} />
            ))}
        </span>
    );
}
