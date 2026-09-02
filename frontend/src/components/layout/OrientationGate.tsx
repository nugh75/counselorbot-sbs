'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getIdentity } from '@/lib/auth';
import { fetchOrientationStatus } from '@/lib/orientation-api';
import { orientationGateBypass } from '@/lib/tool-catalog';

export function OrientationGate({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        let active = true;
        const exempt = orientationGateBypass(pathname, window.location.search);
        if (exempt) {
            setChecking(false);
            return () => { active = false; };
        }
        setChecking(true);
        void (async () => {
            try {
                const identity = await getIdentity();
                if (!active || !identity?.authenticated) return;
                const status = await fetchOrientationStatus();
                if (!active || !status.required) return;
                const destination = `${window.location.pathname}${window.location.search}`;
                active = false;
                router.replace(`/bussola?next=${encodeURIComponent(destination)}`);
            } catch {
                // Un errore di rete non deve trasformarsi in un blocco senza uscita.
            } finally {
                if (active) setChecking(false);
            }
        })();
        return () => { active = false; };
    }, [pathname, router]);

    if (checking) {
        return <div className="mx-auto mt-16 h-1 w-24 overflow-hidden rounded-full bg-slate-200" aria-busy="true"><span className="block h-full w-1/2 animate-pulse rounded-full bg-indigo-500" /></div>;
    }
    return children;
}
