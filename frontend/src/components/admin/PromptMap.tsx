'use client';

import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownRight, ChevronDown, ChevronRight, ChevronUp, Layers, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { apiFetch } from '@/lib/auth';
import { PromptHistory } from '@/components/admin/PromptHistory';
import { PromptRequestPreview } from '@/components/admin/PromptRequestPreview';
import type { AdminGuidedStepQuestion } from '@/lib/guided-step-questions';
import {
    PROMPT_MAP_LANGUAGES, badgeFor, booleanFlags, componentsValue, entryAnchor, entryText, findEntry, levelAnchor, levelCounts,
    levelSection, moveItem, needsSharedConfirm, saveRequest, sectionDefaultOpen, sectionsForEntry, sortOrderChanges, stepAnchor, stepSection, stepsByInstrument,
    type PromptMap as PromptMapData, type PromptMapBadge, type PromptMapCounselor, type PromptMapEntry, type PromptMapInstrument,
    type PromptMapLevel, type PromptMapRef, type PromptMapStep, type PromptMapUser,
} from '@/lib/prompt-map';

// Vista "Mappa dei prompt": i testi delle chat guidate di uno strumento dal
// comune al particolare (docs/operations/admin-prompt-map.md). Livelli, chiavi
// e destinazioni arrivano da GET /api/admin/prompt-map; i salvataggi passano
// dalle API esistenti, che scrivono lo storico delle revisioni.

const INSTRUMENT_PARAM = 'instrument';
const LEVELS: PromptMapLevel[] = ['common', 'group', 'instrument', 'step'];
const LEVEL_NUMBER: Record<PromptMapLevel, string> = { common: '①', group: '②', instrument: '③', step: '④' };
export const LEVEL_STYLE: Record<PromptMapLevel, string> = {
    common: 'border-slate-300 bg-slate-50 text-slate-700',
    group: 'border-amber-300 bg-amber-50 text-amber-800',
    instrument: 'border-indigo-300 bg-indigo-50 text-indigo-800',
    step: 'border-violet-300 bg-violet-50 text-violet-800',
};
const BADGE_STYLE: Record<PromptMapBadge, string> = {
    'model-entry': 'border-indigo-200 bg-indigo-50 text-indigo-700',
    'model-turn': 'border-indigo-300 bg-white text-indigo-700',
    'model-follow-up': 'border-sky-200 bg-sky-50 text-sky-700',
    student: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    admin: 'border-slate-200 bg-slate-100 text-slate-600',
    context: 'border-amber-200 bg-amber-50 text-amber-800',
};
const COLOR_THEMES = ['blue', 'purple', 'indigo', 'pink', 'orange', 'teal', 'green', 'red', 'amber', 'cyan', 'slate', 'rose'];
const COLOR_DOT: Record<string, string> = {
    blue: 'bg-blue-500', purple: 'bg-purple-500', indigo: 'bg-indigo-500', pink: 'bg-pink-500', orange: 'bg-orange-500', teal: 'bg-teal-500',
    green: 'bg-green-500', red: 'bg-red-500', amber: 'bg-amber-500', cyan: 'bg-cyan-500', slate: 'bg-slate-500', rose: 'bg-rose-500',
};

const readInstrumentParam = () => {
    try { return new URLSearchParams(window.location.search).get(INSTRUMENT_PARAM) || ''; } catch { return ''; }
};

/** Scrive `?instrument=` accanto a `?section=` (link condivisibili alla mappa di uno strumento). */
export const writeInstrumentParam = (instrument: string | null) => {
    try {
        const url = new URL(window.location.href);
        if (instrument) url.searchParams.set(INSTRUMENT_PARAM, instrument);
        else url.searchParams.delete(INSTRUMENT_PARAM);
        window.history.replaceState(window.history.state, '', url);
    } catch { /* URL non scrivibile: la vista funziona comunque */ }
};

function Badge({ kind }: { kind: PromptMapBadge }) {
    const { t } = useI18n();
    return <span className={`inline-flex items-center whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${BADGE_STYLE[kind]}`}>
        {t(`admin.promptMap.badge.${kind}`)}
    </span>;
}

function LevelTag({ level, name }: { level: PromptMapLevel; name: string }) {
    const { t } = useI18n();
    return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-semibold ${LEVEL_STYLE[level]}`}>
        {LEVEL_NUMBER[level]} {level === 'instrument' ? name : t(`admin.promptMap.levelShort.${level}`)}
    </span>;
}

function useInstrumentName() {
    const { tf } = useI18n();
    return useCallback((id: string) => tf(`q.${id}.fullName`, id), [tf]);
}

/** Titolo breve dello strumento (es. "QSA", "Evento di studio"), nella lingua dell'admin. */
function useInstrumentShortName() {
    const { tf } = useI18n();
    return useCallback((id: string) => tf(`q.${id}.name`, id), [tf]);
}

function userStepTitle(step: PromptMapUser, lang: string, t: (key: string) => string) {
    if (step.fixed) return t(`admin.promptMap.phase.${step.step_id}`);
    return step.label_i18n?.[lang] || step.label;
}

function stepTitle(step: PromptMapStep, lang: string, t: (key: string) => string) {
    if (step.fixed) return t(`admin.promptMap.phase.${step.id}`);
    return step.label_i18n?.[lang] || step.label;
}

function entryTitle(entry: PromptMapEntry, t: (key: string) => string, tf: (key: string, fallback: string) => string) {
    if (entry.kind === 'guided_step') return t(`admin.promptMap.field.${entry.field}`);
    if (entry.kind === 'config') return tf(`admin.config.label.${entry.key}`, t(`admin.promptMap.role.${entry.role}`));
    return t(`admin.promptMap.role.${entry.role}`);
}

function UsedBy({ entry }: { entry: PromptMapEntry }) {
    const { t } = useI18n();
    const name = useInstrumentShortName();
    const { instruments, steps } = entry.used_by;
    if (instruments.length > 1) {
        return <span>{t('admin.promptMap.usedByInstruments', { count: instruments.length, names: instruments.map(name).join(' · ') })}</span>;
    }
    if (steps.length > 1) {
        return <span title={steps.map(step => step.label).join(' · ')}>{t('admin.promptMap.usedBySteps', { count: steps.length })}</span>;
    }
    return null;
}

/** Step di una voce condivisa, per strumento: il dettaglio di "usato da". */
function UsedBySteps({ entry }: { entry: PromptMapEntry }) {
    const { t, lang } = useI18n();
    const name = useInstrumentShortName();
    const { instruments, steps } = entry.used_by;
    if (!steps.length || (instruments.length < 2 && steps.length < 2)) return null;
    return <details data-used-by-steps className="mt-1 text-[11px] text-slate-500">
        <summary className="cursor-pointer select-none">{t('admin.promptMap.stepCount', { count: steps.length })}</summary>
        <ul className="mt-1 space-y-0.5 pl-3">
            {stepsByInstrument(entry).filter(item => item.steps.length).map(item => <li key={item.instrument}>
                <span className="font-semibold text-slate-600">{name(item.instrument)}:</span> {item.steps.map(step => userStepTitle(step, lang, t)).join(' · ')}
            </li>)}
        </ul>
    </details>;
}

function sharedUsers(entry: PromptMapEntry, name: (id: string) => string, t: (key: string, params?: Record<string, string | number>) => string) {
    const { instruments, steps } = entry.used_by;
    if (instruments.length > 1) {
        const names = instruments.map(name).join(' · ');
        return steps.length ? `${names} (${t('admin.promptMap.stepCount', { count: steps.length })})` : names;
    }
    return steps.map(step => step.label).join(' · ');
}

function EntryEditor({ entry, onSaved, onCancel, componentLabels }: {
    entry: PromptMapEntry;
    onSaved: () => void;
    onCancel: () => void;
    componentLabels?: Record<string, string>;
}) {
    const { t } = useI18n();
    const name = useInstrumentShortName();
    const fieldId = useId();
    const multilingual = !!entry.translations && (entry.destination === 'student');
    const [language, setLanguage] = useState('it');
    const [draft, setDraft] = useState(() => entryText(entry, 'it'));
    const [flags, setFlags] = useState(() => booleanFlags(entry.effective));
    const [confirming, setConfirming] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const isComponents = entry.role === 'components';
    const isColor = entry.kind === 'guided_step' && entry.field === 'color_theme';
    const shared = needsSharedConfirm(entry);

    const save = async () => {
        if (shared && !confirming) { setConfirming(true); return; }
        setSaving(true);
        setError('');
        try {
            const value = isComponents ? componentsValue(entry.value, flags) : draft;
            const request = saveRequest(entry, value, multilingual ? language : 'it');
            const response = await apiFetch(request.url, {
                method: request.method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request.body),
            });
            if (!response.ok) throw new Error('save');
            onSaved();
        } catch {
            setError(t('admin.promptMap.saveError'));
        } finally {
            setSaving(false);
        }
    };

    return <div className="mt-3 space-y-3">
        {multilingual && <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
            {t('admin.promptMap.language')}
            <select value={language} onChange={event => { setLanguage(event.target.value); setDraft(entryText(entry, event.target.value)); setConfirming(false); }}
                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs">
                {PROMPT_MAP_LANGUAGES.map(code => <option key={code} value={code}>{code.toUpperCase()}</option>)}
            </select>
        </label>}
        {isComponents ? <fieldset className="grid gap-1.5 sm:grid-cols-2">
            <legend className="mb-1 text-xs text-slate-500">{t('admin.promptMap.componentsHint')}</legend>
            {Object.entries(flags).map(([flag, on]) => <label key={flag} className="flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={on} onChange={event => { setFlags({ ...flags, [flag]: event.target.checked }); setConfirming(false); }} />
                {componentLabels?.[flag] || flag}
            </label>)}
        </fieldset> : isColor ? <select aria-label={t('admin.promptMap.field.color_theme')} value={draft} onChange={event => setDraft(event.target.value)}
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
            {COLOR_THEMES.map(color => <option key={color} value={color}>{t(`admin.color.${color}`)}</option>)}
        </select> : entry.kind === 'guided_step' && entry.field === 'label' ? <input id={fieldId} aria-label={t('admin.promptMap.field.label')} value={draft}
            onChange={event => { setDraft(event.target.value); setConfirming(false); }}
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" /> : <textarea id={fieldId} aria-label={entry.key} value={draft}
            onChange={event => { setDraft(event.target.value); setConfirming(false); }} rows={Math.min(18, Math.max(6, draft.split('\n').length + 1))}
            className="w-full rounded border border-slate-300 bg-white p-2 font-mono text-xs leading-relaxed text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500" />}
        {confirming && <p role="alert" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {t('admin.promptMap.sharedWarning', { users: sharedUsers(entry, name, t) })}
        </p>}
        {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onCancel} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                {t('admin.promptMap.cancel')}
            </button>
            <button type="button" onClick={save} disabled={saving}
                className={`rounded px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60 ${confirming ? 'bg-amber-600 hover:bg-amber-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                {saving ? t('admin.promptMap.saving') : confirming ? t('admin.promptMap.saveForAll') : t('admin.promptMap.save')}
            </button>
        </div>
        {entry.kind === 'config' && <PromptHistory scope="config" targetKey={multilingual && language !== 'it' ? `${entry.key}__${language}` : entry.key}
            currentValue={entryText(entry, multilingual ? language : 'it')} onRestored={onSaved} />}
        {entry.kind === 'guided_step' && entry.field === 'prompt' && <PromptHistory scope="guided_step" targetKey={entry.editor.path.split('/').pop() || ''}
            currentValue={String(entry.value ?? '')} onRestored={onSaved} />}
    </div>;
}

function EntryCard({ entry, highlighted, onSaved, onEditPersona, onEditQuestions, componentLabels, initiallyEditing = false, onCloseEditor }: {
    entry: PromptMapEntry;
    highlighted?: boolean;
    onSaved: () => void;
    onEditPersona: (counselor: PromptMapCounselor) => void;
    onEditQuestions?: (entry: PromptMapEntry) => void;
    componentLabels?: Record<string, string>;
    initiallyEditing?: boolean;
    onCloseEditor?: () => void;
}) {
    const { t, tf, lang } = useI18n();
    const [editing, setEditing] = useState(initiallyEditing);
    const close = () => { setEditing(false); onCloseEditor?.(); };
    const text = entry.kind === 'config' || entry.kind === 'guided_step' ? entryText(entry, entry.destination === 'student' && entry.translations ? lang : 'it') : '';
    const counselors = entry.kind === 'counselor_persona' ? entry.value as PromptMapCounselor[] : [];
    const questions = entry.kind === 'step_questions' ? entry.value as Record<string, string[]> : {};
    const flags = entry.role === 'components' ? booleanFlags(entry.effective) : {};

    return <article id={entryAnchor(entry.key)} data-entry-key={entry.key}
        className={`scroll-mt-24 rounded-lg border bg-white p-3 shadow-sm transition-shadow sm:p-4 ${highlighted ? 'border-indigo-400 ring-2 ring-indigo-300' : 'border-slate-200'}`}>
        <header className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
                <h5 className="text-sm font-semibold text-slate-800">{entryTitle(entry, t, tf)}</h5>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                    {entry.kind === 'config' && <code className="break-all font-mono">{entry.key}</code>}
                    <UsedBy entry={entry} />
                    {entry.kind === 'config' && !entry.stored && <span className="italic">{t('admin.promptMap.notStored')}</span>}
                </p>
                <UsedBySteps entry={entry} />
            </div>
            <div className="flex flex-wrap items-center gap-1">
                <Badge kind={badgeFor(entry)} />
                {entry.read_only && <span className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{t('admin.promptMap.badge.readOnly')}</span>}
            </div>
        </header>

        {entry.kind === 'counselor_persona' && <ul className="mt-3 space-y-2">
            {counselors.length === 0 && <li className="text-xs text-slate-500">{t('admin.promptMap.noPersona')}</li>}
            {counselors.map(counselor => <li key={counselor.id} className="flex items-start gap-3 rounded border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-700">{counselor.name}</p>
                    <p className="line-clamp-2 whitespace-pre-wrap text-xs text-slate-500">{counselor.persona || t('admin.promptMap.empty')}</p>
                </div>
                <button type="button" onClick={() => onEditPersona(counselor)} aria-label={`${t('admin.promptMap.edit')} · ${counselor.name}`}
                    className="inline-flex shrink-0 items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    <Pencil aria-hidden className="h-3 w-3" />{t('admin.promptMap.edit')}
                </button>
            </li>)}
        </ul>}

        {entry.kind === 'step_questions' && <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            {Object.keys(questions).length === 0 ? <p>{t('admin.promptMap.noQuestions')}</p>
                : <p>{Object.entries(questions).map(([code, items]) => `${code.toUpperCase()} ${items.length}`).join(' · ')}</p>}
            {onEditQuestions && <button type="button" onClick={() => onEditQuestions(entry)}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <Pencil aria-hidden className="h-3 w-3" />{t('admin.promptMap.editQuestions')}
            </button>}
        </div>}

        {entry.role === 'components' && !editing && <p className="mt-2 flex flex-wrap gap-1">
            {Object.entries(flags).map(([flag, on]) => <span key={flag} className={`rounded px-1.5 py-0.5 text-[11px] ${on ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400 line-through'}`}>
                {componentLabels?.[flag] || flag}
            </span>)}
        </p>}

        {entry.kind === 'guided_step' && entry.field === 'color_theme' && !editing && <p className="mt-2 flex items-center gap-2 text-xs text-slate-600">
            <span aria-hidden className={`h-3 w-3 rounded-full ${COLOR_DOT[text] || 'bg-slate-400'}`} />{t(`admin.color.${text}`)}
        </p>}

        {(entry.kind === 'config' && entry.role !== 'components') || (entry.kind === 'guided_step' && entry.field !== 'color_theme') ? !editing && <p className="mt-2 line-clamp-4 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-600">
            {text || t('admin.promptMap.empty')}
        </p> : null}

        {!entry.read_only && entry.kind !== 'step_questions' && !editing && <div className="mt-2 flex justify-end">
            <button type="button" onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                <Pencil aria-hidden className="h-3 w-3" />{t('admin.promptMap.edit')}
            </button>
        </div>}
        {editing && <EntryEditor entry={entry} componentLabels={componentLabels} onCancel={close} onSaved={() => { close(); onSaved(); }} />}
    </article>;
}

function RefRow({ map, refItem, onGo, onOverride }: {
    map: PromptMapData;
    refItem: PromptMapRef;
    onGo: (key: string) => void;
    onOverride?: () => void;
}) {
    const { t, tf } = useI18n();
    const name = useInstrumentName();
    const target = findEntry(map, refItem.key);
    const text = target ? entryText(target, 'it') : '';
    return <li className="rounded border border-dashed border-slate-200 bg-slate-50/70 px-3 py-2 text-slate-500">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="font-semibold text-slate-600">{target ? entryTitle(target, t, tf) : t(`admin.promptMap.role.${refItem.role}`)}</span>
            <code className="break-all font-mono text-[11px]">{refItem.key}</code>
            <Badge kind={badgeFor({ destination: target?.destination ?? 'model', when: refItem.when })} />
            <span className="inline-flex items-center gap-1">
                {t('admin.promptMap.inheritedFrom')} <LevelTag level={refItem.level} name={name(map.instrument)} />
            </span>
            <button type="button" onClick={() => onGo(refItem.key)} className="inline-flex items-center gap-0.5 font-semibold text-indigo-600 hover:underline">
                {t('admin.promptMap.goTo')}<ArrowDownRight aria-hidden className="h-3 w-3 -rotate-90" />
            </button>
            {onOverride && <button type="button" onClick={onOverride} className="font-semibold text-slate-600 underline-offset-2 hover:underline">
                {t('admin.promptMap.overrideMeta')}
            </button>}
        </div>
        {text && <p className="mt-1 line-clamp-1 break-words text-[11px] text-slate-400">{text}</p>}
    </li>;
}

function DialogShell({ title, hint, onClose, children, footer }: {
    title: string;
    hint?: string;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
}) {
    const { t } = useI18n();
    const titleId = useId();
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);
    return createPortal(<div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
        <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl bg-white shadow-xl sm:rounded-xl">
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div className="min-w-0">
                    <h4 id={titleId} className="break-words text-sm font-bold text-slate-800">{title}</h4>
                    {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
                </div>
                <button type="button" onClick={onClose} aria-label={t('admin.promptMap.close')} className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </header>
            <div className="space-y-3 overflow-y-auto px-4 py-3">{children}</div>
            {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3">{footer}</footer>}
        </div>
    </div>, document.body);
}

function PersonaDialog({ counselor, onClose, onSaved }: { counselor: PromptMapCounselor; onClose: () => void; onSaved: () => void }) {
    const { t } = useI18n();
    const [draft, setDraft] = useState(counselor.persona);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const save = async () => {
        setSaving(true);
        setError('');
        try {
            // Stessa API e stesso formato del tab Counselor (CounselorsPanel).
            const response = await apiFetch(`/api/admin/counselors/${counselor.id}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ persona: draft.trim() || null }),
            });
            if (!response.ok) throw new Error('save');
            onSaved();
        } catch {
            setError(t('admin.promptMap.saveError'));
        } finally {
            setSaving(false);
        }
    };
    return <DialogShell title={t('admin.promptMap.personaTitle', { name: counselor.name })} hint={t('admin.promptMap.personaHint')} onClose={onClose}
        footer={<>
            <button type="button" onClick={onClose} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{t('admin.promptMap.cancel')}</button>
            <button type="button" onClick={save} disabled={saving} className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                {saving ? t('admin.promptMap.saving') : t('admin.promptMap.save')}
            </button>
        </>}>
        <label className="block text-xs font-medium text-slate-500">{t('admin.counselors.persona')}
            <textarea autoFocus value={draft} onChange={event => setDraft(event.target.value)} rows={12}
                className="mt-1 w-full rounded border border-slate-300 p-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500" />
        </label>
        {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
        <PromptHistory scope="counselor_persona" targetKey={String(counselor.id)} currentValue={counselor.persona} onRestored={onSaved} />
    </DialogShell>;
}

const QUESTIONS_API = '/api/admin/guided-step-questions';

/** Domande suggerite di uno step, per lingua, con le API di guided_step_questions (stessa tabella della scheda dedicata). */
function QuestionsDialog({ entry, stepName, onClose }: { entry: PromptMapEntry; stepName: string; onClose: (changed: boolean) => void }) {
    const { t } = useI18n();
    const { questionnaire_type: instrument = '', step_id: stepId = '' } = entry.editor;
    const [items, setItems] = useState<AdminGuidedStepQuestion[] | null>(null);
    const [language, setLanguage] = useState('it');
    const [draft, setDraft] = useState('');
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editText, setEditText] = useState('');
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [changed, setChanged] = useState(false);
    const close = useCallback(() => onClose(changed), [changed, onClose]);

    const load = useCallback(async () => {
        try {
            const response = await apiFetch(QUESTIONS_API);
            if (!response.ok) throw new Error('load');
            const rows: AdminGuidedStepQuestion[] = await response.json();
            setItems(rows.filter(row => row.questionnaire_type === instrument && row.step_id === stepId));
        } catch {
            setError(t('admin.promptMap.questions.loadError'));
        }
    }, [instrument, stepId, t]);
    useEffect(() => { void load(); }, [load]);

    const byLanguage = (code: string) => (items ?? []).filter(row => row.language === code)
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    const list = byLanguage(language);

    const run = async (requests: { url: string; method: string; body?: unknown }[]) => {
        setBusy(true);
        setError('');
        try {
            for (const request of requests) {
                const response = await apiFetch(request.url, {
                    method: request.method,
                    ...(request.body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request.body) }),
                });
                if (!response.ok) throw new Error('save');
            }
            setChanged(true);
            setEditingId(null);
            setDeletingId(null);
            await load();
            return true;
        } catch {
            setError(t('admin.promptMap.saveError'));
            await load();
            return false;
        } finally {
            setBusy(false);
        }
    };

    const add = async () => {
        const text = draft.trim();
        if (!text) return;
        const sortOrder = list.reduce((max, row) => Math.max(max, row.sort_order), -1) + 1;
        if (await run([{ url: QUESTIONS_API, method: 'POST', body: { questionnaire_type: instrument, step_id: stepId, language, text, sort_order: sortOrder, is_active: true } }])) setDraft('');
    };
    const move = (index: number, delta: number) => run(sortOrderChanges(moveItem(list, index, index + delta))
        .map(change => ({ url: `${QUESTIONS_API}/${change.id}`, method: 'PUT', body: { sort_order: change.sort_order } })));

    const iconButton = 'inline-flex h-8 min-w-8 items-center justify-center rounded border border-slate-300 bg-white px-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40';
    return <DialogShell title={t('admin.promptMap.questions.title', { step: stepName })} hint={t('admin.promptMap.questions.hint')} onClose={close}
        footer={<button type="button" onClick={close} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{t('admin.promptMap.close')}</button>}>
        <div role="group" aria-label={t('admin.promptMap.questions.languages')} className="flex flex-wrap gap-1.5">
            {PROMPT_MAP_LANGUAGES.map(code => <button key={code} type="button" aria-pressed={code === language}
                onClick={() => { setLanguage(code); setEditingId(null); setDeletingId(null); }}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${code === language ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}>
                {code.toUpperCase()} {items ? byLanguage(code).length : ''}
            </button>)}
        </div>
        {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
        {!items && !error && <p className="text-xs text-slate-500">{t('admin.promptMap.loading')}</p>}
        {items && <ol aria-label={t('admin.promptMap.role.suggested_questions')} className="space-y-2">
            {list.length === 0 && <li className="text-xs text-slate-500">{t('admin.promptMap.questions.empty')}</li>}
            {list.map((row, index) => <li key={row.id} data-question-id={row.id} className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                {editingId === row.id ? <div className="space-y-2">
                    <textarea autoFocus aria-label={t('admin.promptMap.edit')} value={editText} onChange={event => setEditText(event.target.value)} rows={3}
                        className="w-full rounded border border-slate-300 bg-white p-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500" />
                    <div className="flex flex-wrap justify-end gap-2">
                        <button type="button" onClick={() => setEditingId(null)} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{t('admin.promptMap.cancel')}</button>
                        <button type="button" disabled={busy || !editText.trim()} onClick={() => run([{ url: `${QUESTIONS_API}/${row.id}`, method: 'PUT', body: { text: editText.trim() } }])}
                            className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">{t('admin.promptMap.save')}</button>
                    </div>
                </div> : <div className="flex flex-wrap items-start gap-2">
                    <p className="min-w-0 flex-1 basis-48 whitespace-pre-wrap break-words text-sm text-slate-700">
                        <span className="mr-1 font-mono text-[11px] text-slate-400">{index + 1}.</span>{row.text}
                        {!row.is_active && <span className="ml-2 rounded border border-slate-300 px-1 text-[10px] font-semibold uppercase text-slate-500">{t('admin.promptMap.questions.inactive')}</span>}
                    </p>
                    <div className="flex shrink-0 flex-wrap gap-1">
                        <button type="button" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={t('admin.promptMap.questions.moveUp')} className={iconButton}><ChevronUp aria-hidden className="h-4 w-4" /></button>
                        <button type="button" disabled={busy || index === list.length - 1} onClick={() => move(index, 1)} aria-label={t('admin.promptMap.questions.moveDown')} className={iconButton}><ChevronDown aria-hidden className="h-4 w-4" /></button>
                        <button type="button" disabled={busy} onClick={() => { setEditingId(row.id); setEditText(row.text); setDeletingId(null); }} aria-label={t('admin.promptMap.edit')} className={iconButton}><Pencil aria-hidden className="h-3.5 w-3.5" /></button>
                        {deletingId === row.id
                            ? <button type="button" disabled={busy} onClick={() => run([{ url: `${QUESTIONS_API}/${row.id}`, method: 'DELETE' }])}
                                className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60">{t('admin.promptMap.questions.confirmDelete')}</button>
                            : <button type="button" disabled={busy} onClick={() => setDeletingId(row.id)} aria-label={t('admin.promptMap.questions.delete')} className={`${iconButton} text-red-700`}><Trash2 aria-hidden className="h-3.5 w-3.5" /></button>}
                    </div>
                </div>}
            </li>)}
        </ol>}
        {items && <div className="space-y-2 rounded border border-dashed border-slate-300 p-3">
            <label className="block text-xs font-semibold text-slate-600">{t('admin.promptMap.questions.new', { lang: language.toUpperCase() })}
                <textarea value={draft} onChange={event => setDraft(event.target.value)} rows={2}
                    className="mt-1 w-full rounded border border-slate-300 bg-white p-2 text-sm font-normal text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500" />
            </label>
            <div className="flex justify-end">
                <button type="button" disabled={busy || !draft.trim()} onClick={add}
                    className="inline-flex items-center gap-1 rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"><Plus aria-hidden className="h-3.5 w-3.5" />{t('admin.promptMap.questions.add')}</button>
            </div>
        </div>}
    </DialogShell>;
}

/** Sezione a tutta larghezza che si apre e si chiude dall'intestazione: livelli e step della mappa. */
function Collapsible({ anchor, open, onToggle, heading, count, hint, actions, headingLevel = 4, className = '', children }: {
    anchor: string;
    open: boolean;
    onToggle: () => void;
    heading: ReactNode;
    count?: string;
    hint?: string;
    actions?: ReactNode;
    headingLevel?: 4 | 5;
    className?: string;
    children: ReactNode;
}) {
    const regionId = useId();
    const Heading = headingLevel === 4 ? 'h4' : 'h5';
    return <section id={anchor} data-section-open={open ? 'true' : 'false'} className={`scroll-mt-4 ${className}`}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Heading className="min-w-0 flex-1">
                <button type="button" aria-expanded={open} aria-controls={open ? regionId : undefined} onClick={onToggle}
                    className="flex w-full min-w-0 items-center gap-2 rounded py-1 text-left hover:bg-slate-900/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                    <ChevronRight aria-hidden className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} />
                    <span className="min-w-0 flex-1">{heading}</span>
                    {count && <span className="shrink-0 whitespace-nowrap text-xs font-normal normal-case tracking-normal text-slate-500">{count}</span>}
                </button>
            </Heading>
            {actions}
        </div>
        {hint && <p className="pl-6 text-xs text-slate-500">{hint}</p>}
        {open && <div id={regionId} className="mt-3">{children}</div>}
    </section>;
}

function LevelTitle({ level, title }: { level: PromptMapLevel; title: string }) {
    return <span className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-800">
        <span aria-hidden className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs ${LEVEL_STYLE[level]}`}>{LEVELS.indexOf(level) + 1}</span>
        <span className="min-w-0 break-words">{title}</span>
    </span>;
}

const OPEN_SECTIONS_KEY = 'cb_prompt_map_sections';

/** Sezioni aperte o chiuse a mano da chi guarda (solo nel suo browser). */
const readOpenSections = (): Record<string, boolean> => {
    try {
        const parsed = JSON.parse(window.localStorage.getItem(OPEN_SECTIONS_KEY) || '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch { return {}; }
};
const writeOpenSections = (value: Record<string, boolean>) => {
    try { window.localStorage.setItem(OPEN_SECTIONS_KEY, JSON.stringify(value)); } catch { /* storage non disponibile: vale per questa visita */ }
};

const LEVEL_BLOCK: Record<PromptMapLevel, string> = {
    common: 'border-l-4 border-l-slate-500',
    group: 'border-l-4 border-l-amber-500',
    instrument: 'border-l-4 border-l-indigo-500',
    step: 'border-l-4 border-l-violet-500',
};

/** Livello da cui arriva un blocco dell'anteprima, dalla chiave che il backend indica come origine. */
export function previewBlockLevel(map: PromptMapData, step: PromptMapStep, key: string, origin?: string): PromptMapLevel | undefined {
    if (key === 'step_prompt') return 'step';
    if (key === 'counselor') return 'common';
    if (!origin) return undefined;
    const entry = findEntry(map, origin);
    if (entry) return entry.level;
    // Meta prompt dello step non salvato: vale quello ereditato dal livello superiore.
    return step.refs.find(ref => ref.key === origin || ref.override_key === origin)?.level;
}

function StepPreview({ map, step, componentLabels }: { map: PromptMapData; step: PromptMapStep; componentLabels?: Record<string, string> }) {
    const { t } = useI18n();
    const name = useInstrumentName();
    const [open, setOpen] = useState(false);
    const prompt = step.entries.find(entry => entry.kind === 'guided_step' && entry.field === 'prompt');
    return <div>
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
            className="rounded border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50">
            {t('admin.promptMap.preview')}
        </button>
        {open && <div className="mt-3 space-y-2">
            <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                <span className="font-semibold">{t('admin.promptMap.previewLegend')}:</span>
                {LEVELS.map(level => <LevelTag key={level} level={level} name={name(map.instrument)} />)}
                <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5">{t('admin.promptMap.previewOther')}</span>
            </p>
            {/* Valori salvati: nessun override, l'anteprima legge il DB come la chat. */}
            <PromptRequestPreview configs={[]} results={[]} componentLabels={componentLabels} followUpMode={step.follow_up_mode}
                step={{ id: step.id, prompt: String(prompt?.value ?? ''), questionnaire_type: map.instrument, system_prompt_mode: step.system_prompt_mode || 'generic' }}
                blockClassName={(key, origin) => {
                    const level = previewBlockLevel(map, step, key, origin);
                    return level ? LEVEL_BLOCK[level] : 'bg-slate-50';
                }} />
        </div>}
    </div>;
}

export function PromptMap({ componentLabels }: { componentLabels?: Record<string, string> }) {
    const { t, lang } = useI18n();
    const name = useInstrumentName();
    const shortName = useInstrumentShortName();
    const [instruments, setInstruments] = useState<PromptMapInstrument[]>([]);
    const [instrument, setInstrument] = useState(readInstrumentParam);
    const [map, setMap] = useState<PromptMapData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [highlight, setHighlight] = useState('');
    const [openSections, setOpenSections] = useState(readOpenSections);
    const [pendingScroll, setPendingScroll] = useState('');
    const [persona, setPersona] = useState<PromptMapCounselor | null>(null);
    const [overrideFor, setOverrideFor] = useState('');
    const [questionsFor, setQuestionsFor] = useState<{ entry: PromptMapEntry; stepName: string } | null>(null);
    const [status, setStatus] = useState('');

    useEffect(() => {
        apiFetch('/api/admin/prompt-map/instruments')
            .then(response => response.ok ? response.json() : Promise.reject(new Error('instruments')))
            .then((items: PromptMapInstrument[]) => {
                setInstruments(items);
                setInstrument(current => items.some(item => item.id === current) ? current : items[0]?.id || '');
            })
            .catch(() => setError(true));
    }, []);

    useEffect(() => {
        if (!instrument) return;
        writeInstrumentParam(instrument);
        return () => writeInstrumentParam(null);
    }, [instrument]);

    const load = useCallback(async (target: string) => {
        setLoading(true);
        setError(false);
        try {
            const response = await apiFetch(`/api/admin/prompt-map?instrument=${encodeURIComponent(target)}`);
            if (!response.ok) throw new Error('map');
            const data: PromptMapData = await response.json();
            setMap(data);
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { if (instrument) void load(instrument); }, [instrument, load]);

    const reload = useCallback(() => {
        setStatus(t('admin.promptMap.saved'));
        setOverrideFor('');
        void load(instrument);
    }, [instrument, load, t]);

    useEffect(() => {
        if (!status) return;
        const timer = setTimeout(() => setStatus(''), 2500);
        return () => clearTimeout(timer);
    }, [status]);

    const isOpen = (section: string) => !!map && (openSections[section] ?? sectionDefaultOpen(map, section));
    const setSections = (sections: string[], value?: boolean) => {
        if (!map) return;
        setOpenSections(current => {
            const next = { ...current };
            for (const section of sections) next[section] = value ?? !(current[section] ?? sectionDefaultOpen(map, section));
            writeOpenSections(next);
            return next;
        });
    };
    const toggle = (section: string) => setSections([section]);

    // "vai": apre il livello (e lo step) della voce, poi ci scorre quando è nel DOM.
    const goTo = (key: string) => {
        if (!map) return;
        setSections(sectionsForEntry(map, key), true);
        setHighlight(key);
        setPendingScroll(key);
        setTimeout(() => setHighlight(current => (current === key ? '' : current)), 2200);
    };
    useEffect(() => {
        if (!pendingScroll) return;
        const frame = requestAnimationFrame(() => {
            document.getElementById(entryAnchor(pendingScroll))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setPendingScroll('');
        });
        return () => cancelAnimationFrame(frame);
    }, [pendingScroll, openSections]);

    const counts = map ? levelCounts(map) : null;
    const instrumentName = map ? name(map.instrument) : '';
    const card = (entry: PromptMapEntry, stepName = '') => <EntryCard key={entry.key} entry={entry} highlighted={highlight === entry.key}
        componentLabels={componentLabels} onSaved={reload} onEditPersona={setPersona}
        onEditQuestions={entry.kind === 'step_questions' ? () => setQuestionsFor({ entry, stepName }) : undefined} />;

    const stepBody = (step: PromptMapStep) => <>
        <div className="space-y-3">
            {step.entries.map(entry => card(entry, stepTitle(step, lang, t)))}
            {step.refs.filter(item => item.role === 'meta' && item.override_key === overrideFor).map(item => <EntryCard key={`override-${item.override_key}`} initiallyEditing
                componentLabels={componentLabels} onSaved={reload} onEditPersona={setPersona} onCloseEditor={() => setOverrideFor('')}
                entry={{
                    key: item.override_key || '', kind: 'config', role: 'meta_step', level: 'step', destination: 'model', when: 'every_turn',
                    value: map ? findEntry(map, item.key)?.value ?? '' : '', stored: false, shared: false,
                    used_by: { instruments: [map?.instrument || ''], steps: [{ instrument: map?.instrument || '', step_id: step.id, label: step.label }] },
                    editor: { method: 'POST', path: '/admin/config' }, read_only: false,
                }} />)}
        </div>
        {map && step.refs.length > 0 && <div className="mt-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">{t('admin.promptMap.inherited')}</p>
            <ul className="space-y-2">
                {step.refs.map(item => <RefRow key={`${item.key}-${item.role}`} map={map} refItem={item} onGo={goTo}
                    onOverride={item.role === 'meta' && item.override_key ? () => setOverrideFor(item.override_key || '') : undefined} />)}
            </ul>
        </div>}
        {map && !step.fixed && <div className="mt-4"><StepPreview key={`${map.instrument}-${step.id}`} map={map} step={step} componentLabels={componentLabels} /></div>}
    </>;

    return <section aria-labelledby="prompt-map-title" className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                    <h3 id="prompt-map-title" className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-800">
                        <Layers aria-hidden className="h-4 w-4 text-indigo-600" />{t('admin.promptMap.title')}
                    </h3>
                    <p className="mt-1 max-w-2xl text-xs text-slate-500">{t('admin.promptMap.intro')}</p>
                </div>
                <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
                    <label className="flex min-w-0 flex-1 flex-col text-xs font-semibold text-slate-600 sm:flex-none">
                        {t('admin.promptMap.instrument')}
                        <select value={instrument} onChange={event => { setInstrument(event.target.value); setOverrideFor(''); }}
                            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm font-medium text-slate-800 sm:w-72">
                            {instruments.map(item => <option key={item.id} value={item.id}>{name(item.id)}</option>)}
                        </select>
                    </label>
                    <button type="button" onClick={() => instrument && void load(instrument)} disabled={loading}
                        className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                        <RefreshCw aria-hidden className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />{t('admin.promptMap.reload')}
                    </button>
                </div>
            </div>
            <details className="mt-3 text-xs" open={false}>
                <summary className="cursor-pointer font-semibold text-slate-600">{t('admin.promptMap.legend')}</summary>
                <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    {(['model-entry', 'model-turn', 'model-follow-up', 'student', 'admin', 'context'] as PromptMapBadge[]).map(kind => <li key={kind} className="flex flex-wrap items-center gap-2 text-slate-600">
                        <Badge kind={kind} />{t(`admin.promptMap.legend.${kind}`)}
                    </li>)}
                </ul>
            </details>
        </div>

        <p role="status" className="sr-only">{status}</p>
        {status && <div className="fixed bottom-4 right-4 z-[80] rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 shadow">{status}</div>}
        {error && <p role="alert" className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{t('admin.promptMap.loadError')}</p>}
        {!map && !error && <p className="text-sm text-slate-500">{t('admin.promptMap.loading')}</p>}

        {map && counts && <div className="space-y-3">
            <Collapsible anchor={levelAnchor('common')} open={isOpen(levelSection('common'))} onToggle={() => toggle(levelSection('common'))}
                className={`rounded-lg border border-slate-200 bg-white px-3 py-2 sm:px-4 ${LEVEL_BLOCK.common}`}
                heading={<LevelTitle level="common" title={t('admin.promptMap.level.common')} />} hint={t('admin.promptMap.level.commonHint')}
                count={t('admin.promptMap.entryCount', { count: counts.common })}>
                <div className="space-y-3 pb-2">{map.levels.common.map(entry => card(entry))}</div>
            </Collapsible>

            <Collapsible anchor={levelAnchor('group')} open={isOpen(levelSection('group'))} onToggle={() => toggle(levelSection('group'))}
                className={`rounded-lg border border-slate-200 bg-white px-3 py-2 sm:px-4 ${LEVEL_BLOCK.group}`}
                heading={<LevelTitle level="group" title={t('admin.promptMap.level.group')} />} hint={t('admin.promptMap.level.groupHint')}
                count={t('admin.promptMap.entryCount', { count: counts.group })}>
                {map.levels.groups.length === 0 && <p className="pb-2 text-xs text-slate-500">{t('admin.promptMap.emptyGroups')}</p>}
                <div className="space-y-4 pb-2">
                    {map.levels.groups.map(group => <div key={group.instruments.join('|')} data-group={group.instruments.join('|')}
                        className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-amber-900">{t('admin.promptMap.groupTitle', { count: group.instruments.length })}</p>
                        <ul aria-label={t('admin.promptMap.groupInstruments')} className="mt-1.5 flex flex-wrap gap-1.5">
                            {group.instruments.map(id => <li key={id} title={name(id)} aria-current={id === map.instrument ? 'true' : undefined}
                                className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${id === map.instrument ? 'border-amber-600 bg-amber-600 text-white' : 'border-amber-300 bg-white text-amber-900'}`}>
                                {shortName(id)}
                            </li>)}
                        </ul>
                        <p className="mt-2 text-xs text-amber-800">⚠ {t('admin.promptMap.groupWarning', { instruments: group.instruments.map(shortName).join(' · ') })}</p>
                        <div className="mt-3 space-y-3">{group.entries.map(entry => card(entry))}</div>
                    </div>)}
                </div>
            </Collapsible>

            <Collapsible anchor={levelAnchor('instrument')} open={isOpen(levelSection('instrument'))} onToggle={() => toggle(levelSection('instrument'))}
                className={`rounded-lg border border-slate-200 bg-white px-3 py-2 sm:px-4 ${LEVEL_BLOCK.instrument}`}
                heading={<LevelTitle level="instrument" title={t('admin.promptMap.level.instrument', { name: instrumentName })} />} hint={t('admin.promptMap.level.instrumentHint')}
                count={t('admin.promptMap.entryCount', { count: counts.instrument })}>
                {map.levels.instrument.length === 0 && <p className="pb-2 text-xs text-slate-500">{t('admin.promptMap.emptyLevel')}</p>}
                <div className="space-y-3 pb-2">{map.levels.instrument.map(entry => card(entry))}</div>
            </Collapsible>

            <Collapsible anchor={levelAnchor('step')} open={isOpen(levelSection('step'))} onToggle={() => toggle(levelSection('step'))}
                className={`rounded-lg border border-slate-200 bg-white px-3 py-2 sm:px-4 ${LEVEL_BLOCK.step}`}
                heading={<LevelTitle level="step" title={t('admin.promptMap.level.step')} />} hint={t('admin.promptMap.level.stepHint')}
                count={t('admin.promptMap.stepCount', { count: counts.step })}>
                <div className="space-y-2 pb-2">
                    {map.levels.steps.map(step => {
                        const section = stepSection(map.instrument, step.id);
                        return <Collapsible key={step.id} anchor={stepAnchor(step.id)} headingLevel={5} open={isOpen(section)} onToggle={() => toggle(section)}
                            className="rounded-lg border border-violet-200 bg-violet-50/30 px-3 py-1.5 sm:px-4"
                            count={t('admin.promptMap.stepEntryCount', { count: step.entries.length, inherited: step.refs.length })}
                            heading={<span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span aria-hidden className={`h-3 w-3 shrink-0 rounded-full ${step.fixed ? 'border border-slate-400' : COLOR_DOT[step.color_theme || ''] || 'bg-slate-400'}`} />
                                <span className="text-sm font-bold text-slate-800">{stepTitle(step, lang, t)}</span>
                                <code className="font-mono text-[11px] font-normal text-slate-500">{step.id}</code>
                                {step.system_prompt_mode && <span className="text-[11px] font-normal text-slate-500">{t('admin.promptMap.mode', { mode: step.system_prompt_mode })}</span>}
                                {step.fixed && <span className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">{t('admin.promptMap.fixedPhase')}</span>}
                            </span>}>
                            <div className="pb-2">{stepBody(step)}</div>
                        </Collapsible>;
                    })}
                </div>
            </Collapsible>
        </div>}

        {questionsFor && <QuestionsDialog entry={questionsFor.entry} stepName={questionsFor.stepName}
            onClose={changed => { setQuestionsFor(null); if (changed) reload(); }} />}
        {persona && <PersonaDialog counselor={persona} onClose={() => setPersona(null)} onSaved={() => { setPersona(null); reload(); }} />}
    </section>;
}
