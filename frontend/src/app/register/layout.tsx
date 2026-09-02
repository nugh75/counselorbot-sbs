import type { Metadata } from 'next';

// Scheda, cronologia e segnalibri identificano la pagina: prima ogni rotta
// dell'app portava lo stesso titolo generico, e più schede aperte erano
// indistinguibili.
export const metadata: Metadata = {
    title: 'Registrazione - CounselorBot',
    description: 'Creazione di un account per usare la piattaforma.',
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
    return children;
}
