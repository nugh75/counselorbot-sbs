import type { Metadata } from 'next';

// Metadati specifici per /guide: scheda, cronologia e segnalibri identificano
// la guida invece del titolo generico dell'app (GUA-09).
export const metadata: Metadata = {
    title: 'Guida all’interfaccia - CounselorBot',
    description: 'Un breve tour di CounselorBot, sezione per sezione.',
};

export default function GuideLayout({ children }: { children: React.ReactNode }) {
    return children;
}
