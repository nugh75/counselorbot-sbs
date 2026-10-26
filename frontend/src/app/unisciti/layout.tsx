import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Unisciti alla classe - CounselorBot',
    description: 'Abbinamento e recupero della sessione studente dal tunnel del docente.',
};

export default function JoinLayout({ children }: { children: React.ReactNode }) {
    return children;
}
