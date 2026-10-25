'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n-context';

// Riscatto del link monouso generato dal guscio desktop (ADR-0002 §3.3).
// Il token viaggia nel frammento (`#t=...`), che il browser non manda al
// server: qui si legge dal DOM e si consegna al backend locale in un POST.
// Il backend risponde 204 impostando il cookie `cb_session` del docente.
type State = 'checking' | 'missing' | 'invalid' | 'error';

function tokenFromHash(hash: string): string {
    const params = new URLSearchParams(hash.replace(/^#/, ''));
    return params.get('t')?.trim() ?? '';
}

export default function LocalAccessPage() {
    const { t } = useI18n();
    const [state, setState] = useState<State>('checking');

    useEffect(() => {
        const token = tokenFromHash(window.location.hash);
        if (!token) {
            setState('missing');
            return;
        }
        let active = true;
        void (async () => {
            try {
                const response = await fetch('/api/local-auth/redeem', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token }),
                });
                if (!active) return;
                if (response.status === 204) {
                    // Ricarica completa: il cookie nuovo deve valere per tutta l'app.
                    window.location.replace('/docente');
                    return;
                }
                setState(response.status === 401 ? 'invalid' : 'error');
            } catch {
                if (active) setState('error');
            }
        })();
        return () => { active = false; };
    }, []);

    const message = state === 'missing'
        ? t('localAuth.missingToken')
        : state === 'invalid'
            ? t('localAuth.invalidToken')
            : state === 'error'
                ? t('localAuth.error')
                : t('localAuth.checking');

    return (
        <section className="page-narrow py-16" aria-live="polite">
            <div className="glass-panel p-8 text-center">
                <h1 className="text-2xl font-bold text-slate-900">{t('localAuth.title')}</h1>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{message}</p>
            </div>
        </section>
    );
}
