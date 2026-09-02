import type { Metadata } from 'next';

// Scheda, cronologia e segnalibri identificano la pagina: prima ogni rotta
// dell'app portava lo stesso titolo generico, e più schede aperte erano
// indistinguibili.
export const metadata: Metadata = {
    title: 'Amministrazione - CounselorBot',
    description: 'Prompt, provider, strumenti, counselor e basi di conoscenza.',
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return children;
}
