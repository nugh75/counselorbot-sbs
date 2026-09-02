import type { Metadata } from 'next';

// Scheda, cronologia e segnalibri identificano la pagina: prima ogni rotta
// dell'app portava lo stesso titolo generico, e più schede aperte erano
// indistinguibili.
export const metadata: Metadata = {
    title: 'Libretto - CounselorBot',
    description: 'La riflessione per dimensione, strumento per strumento.',
};

export default function ProfiloLibrettoLayout({ children }: { children: React.ReactNode }) {
    return children;
}
