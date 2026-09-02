import type { Metadata } from 'next';

// Scheda, cronologia e segnalibri identificano la pagina: prima ogni rotta
// dell'app portava lo stesso titolo generico, e più schede aperte erano
// indistinguibili.
export const metadata: Metadata = {
    title: 'Questionario di gradimento - CounselorBot',
    description: 'Il riscontro sull’esperienza d’uso della piattaforma.',
};

export default function QuestionarioLayout({ children }: { children: React.ReactNode }) {
    return children;
}
