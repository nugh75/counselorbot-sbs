'use client';

import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';

export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
    return (
        <div className="mx-auto max-w-3xl space-y-4">
            <PageHeader title="Qualcosa è andato storto" />
            <p className="text-ink-body">Si è verificato un errore imprevisto. Puoi riprovare oppure tornare alla tua area.</p>
            <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => retry()}>Riprova</Button>
                <Link href="/profilo" className="inline-flex min-h-control items-center rounded-control border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink-body hover:bg-surface-raised">Torna alla tua area</Link>
            </div>
        </div>
    );
}
