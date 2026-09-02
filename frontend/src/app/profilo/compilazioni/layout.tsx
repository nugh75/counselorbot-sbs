import type { Metadata } from 'next';

// Scheda, cronologia e segnalibri identificano la pagina: prima ogni rotta
// dell'app portava lo stesso titolo generico, e più schede aperte erano
// indistinguibili.
export const metadata: Metadata = {
    title: 'Compilazioni - CounselorBot',
    description: 'Lo storico dei questionari compilati e dei loro esiti.',
};

export default function ProfiloCompilazioniLayout({ children }: { children: React.ReactNode }) {
    return children;
}
