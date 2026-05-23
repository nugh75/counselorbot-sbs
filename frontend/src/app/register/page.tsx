'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Registrazione gestita da ai4auth. Rimandiamo alla home.
export default function RegisterPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/');
    }, [router]);
    return null;
}
