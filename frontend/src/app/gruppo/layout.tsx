import type { Metadata } from 'next';

// Scheda, cronologia e segnalibri identificano la pagina: prima ogni rotta
// dell'app portava lo stesso titolo generico, e più schede aperte erano
// indistinguibili.
export const metadata: Metadata = {
    title: 'Iscrizione a una classe - CounselorBot',
    description: 'Ingresso in un gruppo con il codice ricevuto dal docente.',
};

export default function GruppoLayout({ children }: { children: React.ReactNode }) {
    return children;
}
