import type { Metadata } from 'next';

// Scheda, cronologia e segnalibri identificano la pagina: prima ogni rotta
// dell'app portava lo stesso titolo generico, e più schede aperte erano
// indistinguibili.
export const metadata: Metadata = {
    title: 'Accesso - CounselorBot',
    description: 'Ingresso con l’account ai4educ.',
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
    return children;
}
