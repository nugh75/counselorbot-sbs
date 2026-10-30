'use client';

import { useI18n } from '@/lib/i18n-context';
import { classLayoutText } from '@/lib/i18n-class-layout';
import { Button } from '@/components/ui/Button';
import type { Institution } from '@/lib/referrals-api';
import type { StudentGroup } from './class-group-types';
import { classGroupTexts } from './class-group-texts';
import type { ClassGroupEditors } from './useClassGroupEditors';

export function ClassGroupEditorStatus({ groupId, editors, disabled = false, onRetrySuccess }: { groupId: number; editors: ClassGroupEditors; disabled?: boolean; onRetrySuccess?: () => void }) {
    const { lang } = useI18n();
    const texts = classGroupTexts[lang as keyof typeof classGroupTexts] ?? classGroupTexts.en;
    const state = editors.states[groupId];
    if (!state) return null;
    return <div className="mt-2 space-y-2 text-xs">
        {state.dirty && <p className="text-ink-muted">{classLayoutText(lang, 'dirty')}</p>}
        {state.busy && <p role="status" className="text-ink-muted">{classLayoutText(lang, 'saving')}</p>}
        {state.saved && <p role="status" className="text-success">{texts.saved}</p>}
        {state.failed && <div role="alert" className="flex flex-wrap items-center gap-2 text-danger">
            <p>{texts.error}</p>
            <Button type="button" variant="secondary" disabled={disabled || state.busy} onClick={async () => { if (await editors.retry(groupId)) onRetrySuccess?.(); }}>{classLayoutText(lang, 'retrySave')}</Button>
        </div>}
    </div>;
}

export function ClassGroupEditor({ group, institutions, editors, disabled = false, showStatus = true, idPrefix = 'group' }: {
    group: StudentGroup; institutions: Institution[]; editors: ClassGroupEditors;
    disabled?: boolean; showStatus?: boolean; idPrefix?: string;
}) {
    const { lang } = useI18n();
    const texts = classGroupTexts[lang as keyof typeof classGroupTexts] ?? classGroupTexts.en;
    const state = editors.states[group.id];
    const ready = !!state && !editors.forbidden;
    const inputClass = 'mt-1 w-full min-w-0 rounded-control border border-line-strong bg-surface px-4 py-2 text-sm';
    return <div className="min-w-0 space-y-4">
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <label className="min-w-0 text-xs font-semibold text-ink-muted">{texts.levelLabel}
                <select value={group.school_level ?? ''} aria-label={texts.levelLabel} disabled={!ready || disabled || state.busy} title={texts.levelHint}
                    onChange={event => void editors.setLevel(group.id, event.target.value)} className={inputClass}>
                    <option value="">{texts.levelNone}</option><option value="secondaria">{texts.levelSecondaria}</option>
                    <option value="universita">{texts.levelUniversita}</option><option value="adulti">{texts.levelAdulti}</option>
                </select>
            </label>
            <label className="min-w-0 text-xs font-semibold text-ink-muted">{texts.institutionLabel}
                <select value={group.institution_id == null ? '' : String(group.institution_id)} aria-label={texts.institutionLabel} disabled={!ready || disabled || state.busy} title={texts.institutionHint}
                    onChange={event => void editors.setInstitution(group.id, event.target.value)} className={inputClass}>
                    <option value="">{texts.institutionNone}</option>
                    {group.institution_id && !institutions.some(row => row.id === group.institution_id) && <option value={group.institution_id}>{group.institution_name ?? texts.institutionLabel}</option>}
                    {institutions.map(institution => <option key={institution.id} value={String(institution.id)}>{institution.name}</option>)}
                </select>
            </label>
        </div>
        <p className="text-xs text-ink-muted">{classLayoutText(lang, 'immediate')}</p>
        <fieldset className="min-w-0 space-y-4 rounded-control border border-line bg-surface-sunken p-4">
            <legend className="px-1 text-sm font-semibold text-ink-body">{texts.contextTitle}</legend>
            <p className="text-xs text-ink-muted">{texts.contextHint}</p>
            <div>
                <label className="block text-xs font-semibold text-ink-muted" htmlFor={`${idPrefix}-desc-${group.id}`}>{texts.descriptionLabel}</label>
                <textarea id={`${idPrefix}-desc-${group.id}`} value={state?.draft.description ?? ''} disabled={!ready}
                    onChange={event => editors.change(group.id, { description: event.target.value })} placeholder={texts.descriptionPlaceholder} rows={3} className={inputClass} />
            </div>
            <div>
                <label className="block text-xs font-semibold text-ink-muted" htmlFor={`${idPrefix}-method-${group.id}`}>{texts.methodologyLabel}</label>
                <textarea id={`${idPrefix}-method-${group.id}`} value={state?.draft.methodologies ?? ''} disabled={!ready}
                    onChange={event => editors.change(group.id, { methodologies: event.target.value })} placeholder={texts.methodologyPlaceholder} rows={3} className={inputClass} />
            </div>
            <label className="flex min-h-control items-start gap-2 py-2 text-xs text-ink-body">
                <input type="checkbox" checked={state?.draft.visible ?? false} disabled={!ready} onChange={event => editors.change(group.id, { visible: event.target.checked })} className="mt-1 accent-brand" />
                {texts.shareContextLabel}
            </label>
            <Button id={`${idPrefix}-save-${group.id}`} type="button" disabled={!ready || disabled || state.busy} onClick={() => void editors.save(group.id)}>{state?.saved ? texts.saved : texts.save}</Button>
        </fieldset>
        {showStatus && <ClassGroupEditorStatus groupId={group.id} editors={editors} disabled={disabled} />}
    </div>;
}
