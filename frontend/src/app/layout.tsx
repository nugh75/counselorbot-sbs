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
        <html lang="it" suppressHydrationWarning>
            <body className={`${inter.className} min-h-screen bg-slate-50 text-slate-900 selection:bg-indigo-100 selection:text-indigo-900`}>
                <I18nProvider>
                    <Header />
                    <main className="pt-20 px-4 pb-12">
                        {children}
                    </main>
                </I18nProvider>
            </body>
        </html>
    );
}
