import type { Metadata } from 'next';

// Scheda, cronologia e segnalibri identificano la pagina: prima ogni rotta
// dell'app portava lo stesso titolo generico, e più schede aperte erano
// indistinguibili.
export const metadata: Metadata = {
    title: 'Bussola - CounselorBot',
    description: 'La chat di orientamento che propone gli strumenti da cui partire.',
};

export default function BussolaLayout({ children }: { children: React.ReactNode }) {
    return children;
}
