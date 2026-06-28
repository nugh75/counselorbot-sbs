import type { Metadata } from 'next';
import { Inter, Bricolage_Grotesque, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { RolePreviewBanner } from '@/components/layout/RolePreviewBanner';
import { ViewAsFetchPatch } from '@/components/layout/ViewAsFetchPatch';
import { I18nProvider } from '@/lib/i18n-context';
import { Toaster } from '@/components/ui/Toast';

// Tre ruoli tipografici. Body = Inter (invariato). Display = Bricolage Grotesque,
// grottesco contemporaneo, usato con parsimonia su titoli/wordmark. Mono = IBM Plex
// Mono per i codici fattore (C1, A1, T1) e i punteggi: i codici SONO dati.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono', display: 'swap' });

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
            <head>
                {/* No-flash: applica il tema salvato prima del primo paint. */}
                <script
                    dangerouslySetInnerHTML={{
                        __html: `(function(){try{if(localStorage.getItem('cb_theme')==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})()`,
                    }}
                />
            </head>
            <body className={`${inter.variable} ${display.variable} ${mono.variable} min-h-screen bg-slate-50 text-slate-900 selection:bg-indigo-100 selection:text-indigo-900`}>
                <I18nProvider>
                    <ViewAsFetchPatch />
                    <Header />
                    <main className="pt-20 px-4 pb-12">
                        {children}
                    </main>
                    <RolePreviewBanner />
                    <Toaster />
                </I18nProvider>
            </body>
        </html>
    );
}
