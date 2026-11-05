'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { useI18n } from '@/lib/i18n-context';
import { practiceNotebookText } from '@/lib/i18n-practice-notebooks';
import { teacherAreaText } from '@/lib/i18n-teacher-area';
import { parsePracticeNotebooks, practiceNotebookAnchor } from '@/lib/practice-notebooks';
import { useTeacherResource } from './useTeacherResource';

const gymHref = '/docente/taccuini-prova';

export function ClassPracticeStudents({ groupId }: { groupId: number }) {
    const { lang, t } = useI18n();
    const l = (key: Parameters<typeof practiceNotebookText>[1]) => practiceNotebookText(lang, key);
    const { data, loading, failed, forbidden, reload } = useTeacherResource('/api/teacher/practice-notebooks', parsePracticeNotebooks);
    if (forbidden) return null;

    const linked = (data ?? []).filter(notebook => !notebook.archived_at && notebook.group_ids.includes(groupId));
    let content;
    if (loading) {
        content = <p role="status" className="text-sm text-ink-muted">{t('common.loading')}</p>;
    } else if (failed) {
        content = (
            <Callout variant="danger">
                <p>{l('loadError')}</p>
                <Button variant="secondary" onClick={() => void reload()}>{l('retry')}</Button>
            </Callout>
        );
    } else if (linked.length) {
        content = (
            <ul className="divide-y divide-line">
                {linked.map(notebook => (
                    <li key={notebook.id}>
                        <Link href={`${gymHref}#${practiceNotebookAnchor(notebook.id)}`} scroll={false}
                            className="inline-flex min-h-control items-center break-words py-2 text-sm font-semibold text-link underline underline-offset-4">
                            <span className="min-w-0">{notebook.title}</span>
                        </Link>
                    </li>
                ))}
            </ul>
        );
    } else {
        content = (
            <div>
                <p className="text-sm text-ink-muted">{l('classPracticeStudentsEmpty')}</p>
                <Link href={gymHref} className="inline-flex min-h-control items-center py-2 text-sm font-semibold text-link underline underline-offset-4">
                    {teacherAreaText(lang, 'practiceGymCta')}
                </Link>
            </div>
        );
    }

    return (
        <Card as="section" aria-labelledby="class-practice-students-heading" className="space-y-3">
            <h2 id="class-practice-students-heading" className="text-lg font-semibold text-ink">{l('classPracticeStudents')}</h2>
            <p className="text-sm text-ink-muted">{l('classPracticeStudentsHint')}</p>
            {content}
        </Card>
    );
}
