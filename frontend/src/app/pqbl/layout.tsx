import type { Metadata } from 'next';

// Scheda, cronologia e segnalibri identificano la pagina: prima ogni rotta
// dell'app portava lo stesso titolo generico, e più schede aperte erano
// indistinguibili.
export const metadata: Metadata = {
    title: 'pQBL - CounselorBot',
    description: 'Domande generate da un documento, con risposte e riscontro.',
};

export default function PqblLayout({ children }: { children: React.ReactNode }) {
    return children;
}
