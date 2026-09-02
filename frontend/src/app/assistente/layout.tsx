import type { Metadata } from 'next';

// Scheda, cronologia e segnalibri identificano la pagina: prima ogni rotta
// dell'app portava lo stesso titolo generico, e più schede aperte erano
// indistinguibili.
export const metadata: Metadata = {
    title: 'Assistente - CounselorBot',
    description: 'Domande sui questionari, sul metodo e sulla piattaforma.',
};

export default function AssistenteLayout({ children }: { children: React.ReactNode }) {
    return children;
}
