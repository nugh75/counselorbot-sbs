import type { Metadata } from 'next';

// Scheda, cronologia e segnalibri identificano la pagina: prima ogni rotta
// dell'app portava lo stesso titolo generico, e più schede aperte erano
// indistinguibili.
export const metadata: Metadata = {
    title: 'Le mie classi - CounselorBot',
    description: 'I gruppi a cui si è iscritti e il codice per entrarne in uno.',
};

export default function ProfiloClassiLayout({ children }: { children: React.ReactNode }) {
    return children;
}
