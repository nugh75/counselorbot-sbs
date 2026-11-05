import { useI18n } from '@/lib/i18n-context';
import { practiceNotebookText } from '@/lib/i18n-practice-notebooks';
import { PRACTICE_NOTEBOOK_FIELDS, type PracticeNotebookData } from '@/lib/practice-notebooks';

export function PracticeNotebookSummary({ data }: { data: PracticeNotebookData }) {
    const { lang, t } = useI18n();
    const filled = PRACTICE_NOTEBOOK_FIELDS.filter(({ key }) => (data[key] ?? '').trim());
    if (!filled.length) return <p className="text-sm text-ink-muted">{practiceNotebookText(lang, 'noFields')}</p>;

    return (
        <dl className="grid gap-2 text-sm">
            {filled.map(({ key, labelKey }) => (
                <div key={key}>
                    <dt className="font-semibold text-ink-muted">{t(labelKey)}</dt>
                    <dd className="whitespace-pre-line break-words text-ink-body">{data[key]}</dd>
                </div>
            ))}
        </dl>
    );
}
