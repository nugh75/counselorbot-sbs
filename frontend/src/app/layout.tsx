import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { I18nProvider } from '@/lib/i18n-context';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'CounselorBot - Analisi Strategie di Apprendimento',
    description: 'Assistente AI per il questionario QSA',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="it" className="dark" suppressHydrationWarning>
            <body className={`${inter.className} min-h-screen bg-gradient-to-br from-gray-900 to-black text-white selection:bg-blue-500/30`}>
                <I18nProvider>
                    <Header />
                    <main className="pt-32 px-4 pb-12">
                        {children}
                    </main>
                </I18nProvider>
            </body>
        </html>
    );
}
