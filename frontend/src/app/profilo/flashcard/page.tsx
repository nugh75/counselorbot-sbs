import { Suspense } from 'react';
import { FlashcardsPage } from '@/components/flashcards/FlashcardsPage';

export default function Page() {
    return <Suspense><FlashcardsPage /></Suspense>;
}
