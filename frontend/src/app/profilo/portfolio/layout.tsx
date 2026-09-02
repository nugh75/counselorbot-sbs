import type { Metadata } from 'next';

// Scheda, cronologia e segnalibri identificano la pagina: prima ogni rotta
// dell'app portava lo stesso titolo generico, e più schede aperte erano
// indistinguibili.
export const metadata: Metadata = {
    title: 'Portfolio - CounselorBot',
    description: 'I lavori raccolti lungo il percorso.',
};

export default function ProfiloPortfolioLayout({ children }: { children: React.ReactNode }) {
    return children;
}
