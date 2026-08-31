'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

// Percorso storico `/somministrazione/<strumento>/<lingua>`. La lingua non e'
// piu' una proprieta' dell'URL, ma i link gia' distribuiti (QR, inviti dei
// ricercatori) devono continuare a funzionare: reindirizzano allo strumento.
export default function LegacyLocaleRedirect() {
    const params = useParams<{ instrument: string; locale: string }>();
    const router = useRouter();

    useEffect(() => {
        const query = typeof window === 'undefined' ? '' : window.location.search;
        router.replace(`/somministrazione/${params.instrument}${query}`);
    }, [params.instrument, router]);

    return null;
}
