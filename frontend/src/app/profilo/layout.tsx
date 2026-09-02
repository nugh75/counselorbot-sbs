import type { Metadata } from 'next';

// Scheda, cronologia e segnalibri identificano la pagina: prima ogni rotta
// dell'app portava lo stesso titolo generico, e più schede aperte erano
// indistinguibili.
export const metadata: Metadata = {
    title: 'Area personale - CounselorBot',
    description: 'Compilazioni, taccuino, libretto, portfolio e classi.',
};

export default function ProfiloLayout({ children }: { children: React.ReactNode }) {
    return children;
}
