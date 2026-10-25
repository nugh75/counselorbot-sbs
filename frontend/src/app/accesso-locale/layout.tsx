import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Accesso locale - CounselorBot',
    description: 'Ingresso con il link monouso dell’app CounselorBot Docente.',
};

export default function LocalAccessLayout({ children }: { children: React.ReactNode }) {
    return children;
}
