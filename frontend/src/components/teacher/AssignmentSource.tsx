import Link from 'next/link';
import type { Lang } from '@/lib/i18n';
import { assignmentText } from '@/lib/i18n-assignments';

export function AssignmentSource({ source, lang }: { source: string; lang: string }) {
    const language = (['it', 'en', 'es', 'fr', 'de', 'sv'].includes(lang) ? lang : 'it') as Lang;
    return /^\/profilo\/assegnazioni#assignment-\d+$/.test(source)
        ? <Link className="inline-block py-2 text-indigo-700 underline" href={source}>{assignmentText(language, 'received')}</Link>
        : <>{source}</>;
}
