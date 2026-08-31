'use client';

import { useParams } from 'next/navigation';
import { QuestionnaireRunner } from '@/components/administration/QuestionnaireRunner';

// La lingua non sta piu' nell'URL: e' quella dell'interfaccia. Se lo strumento
// non e' certificato in quella lingua, il runner lo dice invece di ripiegare.
export default function AdministrationPage() {
    const params = useParams<{ instrument: string }>();
    return <QuestionnaireRunner instrument={params.instrument} />;
}
