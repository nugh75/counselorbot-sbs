import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';

export default function NotFound() {
    return (
        <div className="mx-auto max-w-3xl space-y-4">
            <PageHeader title="Pagina non trovata" />
            <p className="text-ink-body">La pagina che cerchi non esiste o è stata spostata.</p>
            <Link href="/profilo" className="inline-flex min-h-control items-center rounded-control bg-brand px-4 py-2 text-sm font-semibold text-ink-on-brand hover:bg-brand-hover">Torna alla tua area</Link>
        </div>
    );
}
