'use client';

import { useEffect } from 'react';
import { getAuthUrls, isLocalAuth } from '@/lib/auth';

// Uscita dall'app. In locale revoca la sessione `cb_session` sul backend e
// torna alla home; in produzione resta il logout ai4auth, che distrugge il
// cookie di dominio.
export default function LogoutPage() {
    useEffect(() => {
        if (!isLocalAuth()) {
            window.location.replace(getAuthUrls().logoutUrl);
            return;
        }
        void fetch('/api/local-auth/logout', { method: 'POST', credentials: 'same-origin' })
            .catch(() => undefined)
            .finally(() => window.location.replace('/'));
    }, []);
    return null;
}
