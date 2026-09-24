import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Obiettivi - CounselorBot',
    description: 'Obiettivi personali organizzati dal perché al come.',
};

export default function ProfiloObiettiviLayout({ children }: { children: React.ReactNode }) {
    return children;
}
