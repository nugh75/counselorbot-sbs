'use client';

import { useEffect } from 'react';
import { ai4authLoginUrl } from '@/lib/auth';

// Il login di questo servizio e' l'accesso alla relativa amministrazione.
export default function LoginPage() {
    useEffect(() => {
        window.location.replace(ai4authLoginUrl('/admin'));
    }, []);
    return null;
}
