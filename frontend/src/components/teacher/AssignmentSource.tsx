import Link from 'next/link';
import type { Lang } from '@/lib/i18n';
import { assignmentText } from '@/lib/i18n-assignments';

export function AssignmentSource({ source, lang, linked = true }: { source: string; lang: string; linked?: boolean }) {
    const language = (['it', 'en', 'es', 'fr', 'de', 'sv'].includes(lang) ? lang : 'it') as Lang;
    const assignment = /^\/profilo\/assegnazioni#assignment-\d+$/.test(source);
    return assignment && linked
        ? <Link className="inline-block py-2 text-indigo-700 underline" href={source}>{assignmentText(language, 'received')}</Link>
        : assignment ? <>{assignmentText(language, 'received')}</>
        : <>{source}</>;
}
