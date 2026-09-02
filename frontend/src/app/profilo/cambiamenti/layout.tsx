import type { Metadata } from 'next';

// Scheda, cronologia e segnalibri identificano la pagina: prima ogni rotta
// dell'app portava lo stesso titolo generico, e più schede aperte erano
// indistinguibili.
export const metadata: Metadata = {
    title: 'Cambiamenti nel profilo - CounselorBot',
    description: 'Come gli esiti si sono mossi fra una compilazione e l’altra.',
};

export default function ProfiloCambiamentiLayout({ children }: { children: React.ReactNode }) {
    return children;
}
