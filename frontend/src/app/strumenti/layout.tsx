import type { Metadata } from 'next';

// Scheda, cronologia e segnalibri identificano la pagina: prima ogni rotta
// dell'app portava lo stesso titolo generico, e più schede aperte erano
// indistinguibili.
export const metadata: Metadata = {
    title: 'Strumenti - CounselorBot',
    description: 'Che cosa misura ogni strumento e come si legge.',
};

export default function StrumentiLayout({ children }: { children: React.ReactNode }) {
    return children;
}
