import type { Metadata } from 'next';

// Scheda, cronologia e segnalibri identificano la pagina: prima ogni rotta
// dell'app portava lo stesso titolo generico, e più schede aperte erano
// indistinguibili.
export const metadata: Metadata = {
    title: 'Somministrazione - CounselorBot',
    description: 'Compilazione di uno strumento nella lingua scelta.',
};

export default function SomministrazioneLayout({ children }: { children: React.ReactNode }) {
    return children;
}
