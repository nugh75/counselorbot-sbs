'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { parseClassPath, type ClassPath } from '@/lib/class-paths';
import { pathTemplateText, type PathTemplateTextKey } from '@/lib/i18n-path-templates';
import { parseTemplateUpdate, type TemplateChange, type TemplateUpdatePreview } from '@/lib/path-templates';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TYPE_LABEL, toolName } from './PathTemplatesPanel';

const CHANGE_LABEL: Record<TemplateChange['change'], PathTemplateTextKey> = {
    added: 'changeAdded', changed: 'changeChanged', removed: 'changeRemoved',
};
const STATUS_LABEL: Record<TemplateChange['status'], PathTemplateTextKey> = {
    apply: 'statusApply', started: 'statusStarted', created: 'statusCreated', tool_disabled: 'statusToolDisabled',
};

/** «Update from template» (#172): differences first, then only untouched steps change. */
export function PathTemplateUpdate({ lang, pathId, revision, disabled, onUpdated, onBlocked }: {
    lang: string;
    pathId: number;
    revision: number;
    disabled: boolean;
    onUpdated: (path: ClassPath) => void;
    onBlocked: (detail: unknown) => Promise<boolean>;
}) {
    const l = (key: PathTemplateTextKey) => pathTemplateText(lang, key);
    const [preview, setPreview] = useState<TemplateUpdatePreview | null>(null);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<'templateUpdated' | 'templateUpdateConflict' | 'templateUnavailable' | 'error' | null>(null);

    const open = async () => {
        setBusy(true);
        setNotice(null);
        try {
            const response = await apiFetch(`/api/teacher/paths/${pathId}/template-update`);
            if (response.ok) setPreview(parseTemplateUpdate(await response.json()));
            else setNotice(response.status === 404 ? 'templateUnavailable' : 'error');
        } catch {
            setNotice('error');
        } finally {
            setBusy(false);
        }
    };

    const applyUpdate = async () => {
        if (!preview) return;
        setBusy(true);
        setNotice(null);
        try {
            const response = await apiFetch(`/api/teacher/paths/${pathId}/template-update`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({revision, template_revision: preview.template_revision}),
            });
            const body = await response.json().catch(() => null);
            if (response.ok) {
                setPreview(null);
                setNotice('templateUpdated');
                onUpdated(parseClassPath(body?.path));
            } else if (await onBlocked(body?.detail)) {
                setPreview(null);
            } else {
                setNotice(response.status === 409 ? 'templateUpdateConflict' : response.status === 404 ? 'templateUnavailable' : 'error');
            }
        } catch {
            setNotice('error');
        } finally {
            setBusy(false);
        }
    };

    const pending = preview?.changes.filter(row => row.status === 'apply').length ?? 0;
    return (
        <>
            <Button variant="secondary" disabled={disabled || busy} onClick={() => void open()}>
                {l('updateFromTemplate')}
            </Button>
            {notice && (
                <p role={notice === 'templateUpdated' ? 'status' : 'alert'}
                    className={`basis-full text-sm font-medium ${notice === 'templateUpdated' ? 'text-emerald-700' : 'text-red-600'}`}>
                    {l(notice)}
                </p>
            )}
            {preview && (
                <Card className="basis-full space-y-3" aria-label={l('updateFromTemplate')}>
                    <div>
                        <p className="font-semibold text-slate-900">{`${l('updateFromTemplate')} · ${preview.template_title}`}</p>
                        <p className="mt-1 text-sm text-slate-600">{l('updateIntro')}</p>
                    </div>
                    {preview.changes.length === 0 ? (
                        <p className="text-sm text-slate-700">{l('updateNone')}</p>
                    ) : (
                        <ul className="space-y-2">
                            {preview.changes.map((row, index) => (
                                <li key={index} className="rounded-md border border-slate-200 p-2 text-sm">
                                    <span className="font-semibold text-slate-800">{l(CHANGE_LABEL[row.change])}</span>
                                    {` · ${l(TYPE_LABEL[row.step_type])}`}
                                    {row.tool_key ? ` · ${toolName(row.tool_key, lang)}` : ''}
                                    {row.title ? ` · ${row.title}` : ''}
                                    <span className={`block text-xs ${row.status === 'apply' ? 'text-emerald-700' : 'text-slate-600'}`}>
                                        {l(STATUS_LABEL[row.status])}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <Button disabled={busy || pending === 0} onClick={() => void applyUpdate()}>{l('applyUpdate')}</Button>
                        <Button variant="secondary" disabled={busy} onClick={() => setPreview(null)}>{l('close')}</Button>
                    </div>
                </Card>
            )}
        </>
    );
}
