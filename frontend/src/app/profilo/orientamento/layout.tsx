import type { Metadata } from 'next';

// Scheda, cronologia e segnalibri identificano la pagina: prima ogni rotta
// dell'app portava lo stesso titolo generico, e più schede aperte erano
// indistinguibili.
export const metadata: Metadata = {
    title: 'Orientamento - CounselorBot',
    description: 'Referenti e appuntamenti del tuo istituto.',
};

export default function ProfiloOrientamentoLayout({ children }: { children: React.ReactNode }) {
    return children;
}
