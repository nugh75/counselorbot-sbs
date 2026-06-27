import { cn } from '@/lib/utils';

// Placeholder di caricamento: percepito più veloce di uno spinner perché
// anticipa la forma del contenuto. bg-slate-200 si scurisce in dark via globals.
export function Skeleton({ className }: { className?: string }) {
    return <div className={cn('animate-pulse rounded-md bg-slate-200', className)} />;
}
