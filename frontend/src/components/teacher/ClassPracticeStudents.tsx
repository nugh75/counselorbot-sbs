'use client';

import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { RoleBadge } from '@/components/ui/RoleBadge';
import { useI18n } from '@/lib/i18n-context';
import { practiceNotebookText } from '@/lib/i18n-practice-notebooks';
import { parsePracticeNotebooks } from '@/lib/practice-notebooks';
import { PracticeNotebookSummary } from './PracticeNotebookSummary';
import { useTeacherResource } from './useTeacherResource';

export function ClassPracticeStudents({ groupId }: { groupId: number }) {
    const { lang, t } = useI18n();
    const l = (key: Parameters<typeof practiceNotebookText>[1]) => practiceNotebookText(lang, key);
    const { data, loading, failed, forbidden, reload } = useTeacherResource(`/api/teacher/groups/${groupId}/practice-notebooks`, parsePracticeNotebooks);
    if (forbidden) return null;

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
    } else if (data?.length) {
        content = (
            <ul className="divide-y divide-line">
                {data.map(notebook => (
                    <li key={notebook.id}>
                        <details>
                            <summary className="min-h-control cursor-pointer break-words py-3 text-sm font-semibold text-ink">
                                {notebook.title}
                                <RoleBadge role="test" className="ml-2 align-middle">{l('testStudentBadge')}</RoleBadge>
                            </summary>
                            <div className="pb-4 pl-4">
                                <PracticeNotebookSummary data={notebook.data} />
                            </div>
                        </details>
                    </li>
                ))}
            </ul>
        );
    } else {
        content = <p className="text-sm text-ink-muted">{l('classPracticeStudentsEmpty')}</p>;
    }

    return (
        <Card as="section" aria-labelledby="class-practice-students-heading" className="space-y-3">
            <h2 id="class-practice-students-heading" className="text-lg font-semibold text-ink">{l('classPracticeStudents')}</h2>
            <p className="text-sm text-ink-muted">{l('classPracticeStudentsHint')}</p>
            {content}
        </Card>
    );
}
