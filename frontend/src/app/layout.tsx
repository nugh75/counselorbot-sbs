import type { Metadata } from 'next';
import { MotionConfig } from 'framer-motion';
import { Inter, Bricolage_Grotesque, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/layout/Header';
import { RolePreviewBanner } from '@/components/layout/RolePreviewBanner';
import { ViewAsFetchPatch } from '@/components/layout/ViewAsFetchPatch';
import { I18nProvider } from '@/lib/i18n-context';
import { Toaster } from '@/components/ui/Toast';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { OrientationGate } from '@/components/layout/OrientationGate';
import { SkipLink } from '@/components/layout/SkipLink';

// Tre ruoli tipografici. Body = Inter (invariato). Display = Bricolage Grotesque,
// grottesco contemporaneo, usato con parsimonia su titoli/wordmark. Mono = IBM Plex
// Mono per i codici fattore (C1, A1, T1) e i punteggi: i codici SONO dati.
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-mono', display: 'swap' });

// Titolo e descrizione della scheda del browser, dei preferiti e delle anteprime
// di condivisione. Restavano fermi al solo QSA mentre l'app copre l'intero
// strumentario: niente conteggi qui, che invecchiano a ogni strumento aggiunto.
export const metadata: Metadata = {
    title: 'CounselorBot — Orientamento e profilo di apprendimento',
    description: 'Percorsi guidati di orientamento, analisi del profilo di apprendimento e conversazione con counselor AI.',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="it" suppressHydrationWarning>
            <head>
                {/* No-flash: tema e lingua salvati applicati prima del primo paint.
                    La lingua arrivava solo dopo l'idratazione, quindi il primo
                    rendering — e con esso la voce di uno screen reader — partiva
                    in italiano anche per chi legge in un'altra delle sei lingue. */}
                <script
                    dangerouslySetInnerHTML={{
                        __html: `(function(){try{if(localStorage.getItem('cb_theme')==='dark'){document.documentElement.classList.add('dark')}var m=localStorage.getItem('cb_motion');if(m==='reduced'||m==='full'){document.documentElement.setAttribute('data-motion',m)}var l=localStorage.getItem('cb_lang');if(l&&['it','en','es','fr','de','sv'].indexOf(l)>-1){document.documentElement.lang=l}}catch(e){}})()`,
                    }}
                />
            </head>
            <body className={`${inter.variable} ${display.variable} ${mono.variable} min-h-screen bg-slate-50 text-slate-900 selection:bg-indigo-100 selection:text-indigo-900`}>
                <I18nProvider>
                    {/* La media query prefers-reduced-motion in globals.css azzera le
                        durate CSS, ma framer-motion anima in JavaScript e non la vede:
                        le transizioni di passo continuavano a muoversi per chi ha
                        chiesto di non farlo. reducedMotion="user" copre ogni motion.*
                        dell'albero, presente e futuro. */}
                    <MotionConfig reducedMotion="user">
                    <TooltipProvider delayDuration={300}>
                        <SkipLink />
                        <ViewAsFetchPatch />
                        <Header />
                        <main id="contenuto" className="pt-20 px-4 pb-12">
                            <OrientationGate>{children}</OrientationGate>
                        </main>
                        <RolePreviewBanner />
                        <Toaster />
                    </TooltipProvider>
                    </MotionConfig>
                </I18nProvider>
            </body>
        </html>
    );
}
