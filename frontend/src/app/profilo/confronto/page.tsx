import { Suspense } from 'react';
import { PersonalVisualWorkspacePage } from '@/components/visual/PersonalVisualWorkspacePage';

export default function Page() {
    return <Suspense><PersonalVisualWorkspacePage tab="comparison" /></Suspense>;
}
