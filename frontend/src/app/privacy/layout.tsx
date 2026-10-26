import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Privacy e consensi - CounselorBot',
    description: 'Informative, scelte di consenso, condivisione del taccuino e cronologia personale.',
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
    return children;
}
