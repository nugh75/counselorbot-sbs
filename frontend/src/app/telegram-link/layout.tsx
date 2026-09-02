import type { Metadata } from 'next';

// Scheda, cronologia e segnalibri identificano la pagina: prima ogni rotta
// dell'app portava lo stesso titolo generico, e più schede aperte erano
// indistinguibili.
export const metadata: Metadata = {
    title: 'Collega Telegram - CounselorBot',
    description: 'Conferma del collegamento fra account e bot Telegram.',
};

export default function TelegramLinkLayout({ children }: { children: React.ReactNode }) {
    return children;
}
