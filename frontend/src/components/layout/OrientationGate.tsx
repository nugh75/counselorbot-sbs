'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { getIdentity } from '@/lib/auth';
import { fetchOrientationStatus } from '@/lib/orientation-api';
import { orientationGateBypass } from '@/lib/tool-catalog';

// Esito del cancello per questa sessione di pagina. Prima si interrogava
// `/orientation/status` a ogni cambio rotta e, finché la risposta non
// arrivava, al posto della pagina c'era una barretta: lo pagavano tutti a ogni
// click — lo studente che ha finito la Bussola mesi fa, l'admin che passa da
// un pannello all'altro — e nessuno di loro poteva esserne rimandato indietro.
// La Bussola, una volta fatta, resta fatta: un accertamento per caricamento.
let gateSettled = false;

export function OrientationGate({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [checking, setChecking] = useState(!gateSettled);

    useEffect(() => {
        if (gateSettled) {
            setChecking(false);
            return;
        }
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
                if (!active) return;
                if (!identity?.authenticated) {
                    // Chi non ha una sessione viene mandato al login da altrove:
                    // il cancello non ha altro da dire e non va più interrogato.
                    gateSettled = true;
                    return;
                }
                const status = await fetchOrientationStatus();
                if (!active) return;
                if (!status.required) {
                    gateSettled = true;
                    return;
                }
                const destination = `${window.location.pathname}${window.location.search}`;
                active = false;
                router.replace(`/bussola?next=${encodeURIComponent(destination)}`);
            } catch {
                // Un errore di rete non deve trasformarsi in un blocco senza
                // uscita: si passa, e si riprova al cambio rotta successivo.
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
