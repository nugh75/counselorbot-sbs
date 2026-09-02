import type { Metadata } from 'next';

// Scheda, cronologia e segnalibri identificano la pagina: prima ogni rotta
// dell'app portava lo stesso titolo generico, e più schede aperte erano
// indistinguibili.
export const metadata: Metadata = {
    title: 'Telegram - CounselorBot',
    description: 'Collegamento dell’account al bot Telegram.',
};

export default function ProfiloTelegramLayout({ children }: { children: React.ReactNode }) {
    return children;
}
