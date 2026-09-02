import type { Metadata } from 'next';

// Scheda, cronologia e segnalibri identificano la pagina: prima ogni rotta
// dell'app portava lo stesso titolo generico, e più schede aperte erano
// indistinguibili.
export const metadata: Metadata = {
    title: 'Taccuino - CounselorBot',
    description: 'Le note che lo studente scrive su di sé.',
};

export default function ProfiloTaccuinoLayout({ children }: { children: React.ReactNode }) {
    return children;
}
