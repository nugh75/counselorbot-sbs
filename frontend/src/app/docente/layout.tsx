import type { Metadata } from 'next';

// Scheda, cronologia e segnalibri identificano la pagina: prima ogni rotta
// dell'app portava lo stesso titolo generico, e più schede aperte erano
// indistinguibili.
export const metadata: Metadata = {
    title: 'Gruppi e classi - CounselorBot',
    description: 'Classi, piani di somministrazione, note e messaggi.',
};

export default function DocenteLayout({ children }: { children: React.ReactNode }) {
    return children;
}
