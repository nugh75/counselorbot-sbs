'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownRight, Layers, Pencil, RefreshCw, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { apiFetch } from '@/lib/auth';
import { PromptHistory } from '@/components/admin/PromptHistory';
import { PromptRequestPreview } from '@/components/admin/PromptRequestPreview';
import {
    PROMPT_MAP_LANGUAGES, badgeFor, booleanFlags, componentsValue, entryAnchor, entryText, findEntry, levelAnchor, levelCounts,
    needsSharedConfirm, saveRequest, stepAnchor,
    type PromptMap as PromptMapData, type PromptMapBadge, type PromptMapCounselor, type PromptMapEntry, type PromptMapInstrument,
    type PromptMapLevel, type PromptMapRef, type PromptMapStep,
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
    const name = useInstrumentName();
    const { instruments, steps } = entry.used_by;
    if (instruments.length > 1) {
        return <span title={instruments.map(name).join(' · ')}>{t('admin.promptMap.usedByInstruments', { count: instruments.length })}</span>;
    }
    if (steps.length > 1) {
        return <span title={steps.map(step => step.label).join(' · ')}>{t('admin.promptMap.usedBySteps', { count: steps.length })}</span>;
    }
    return null;
}

function sharedUsers(entry: PromptMapEntry, name: (id: string) => string) {
    const { instruments, steps } = entry.used_by;
    if (instruments.length > 1) return instruments.map(name).join(' · ');
    return steps.map(step => step.label).join(' · ');
}

function EntryEditor({ entry, onSaved, onCancel, componentLabels }: {
    entry: PromptMapEntry;
    onSaved: () => void;
    onCancel: () => void;
    componentLabels?: Record<string, string>;
}) {
    const { t } = useI18n();
    const name = useInstrumentName();
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
            {t('admin.promptMap.sharedWarning', { users: sharedUsers(entry, name) })}
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

function EntryCard({ entry, highlighted, onSaved, onEditPersona, componentLabels, initiallyEditing = false, onCloseEditor }: {
    entry: PromptMapEntry;
    highlighted?: boolean;
    onSaved: () => void;
    onEditPersona: (counselor: PromptMapCounselor) => void;
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

        {entry.kind === 'step_questions' && <div className="mt-2 text-xs text-slate-600">
            {Object.keys(questions).length === 0 ? <p>{t('admin.promptMap.noQuestions')}</p>
                : <p>{Object.entries(questions).map(([code, items]) => `${code.toUpperCase()} ${items.length}`).join(' · ')}</p>}
            <p className="mt-1 text-slate-500">{t('admin.promptMap.questionsHint')}</p>
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

        {!entry.read_only && !editing && <div className="mt-2 flex justify-end">
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

function PersonaDialog({ counselor, onClose, onSaved }: { counselor: PromptMapCounselor; onClose: () => void; onSaved: () => void }) {
    const { t } = useI18n();
    const titleId = useId();
    const [draft, setDraft] = useState(counselor.persona);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);
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
    return createPortal(<div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
        <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl bg-white shadow-xl sm:rounded-xl">
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
                <div>
                    <h4 id={titleId} className="text-sm font-bold text-slate-800">{t('admin.promptMap.personaTitle', { name: counselor.name })}</h4>
                    <p className="mt-0.5 text-xs text-slate-500">{t('admin.promptMap.personaHint')}</p>
                </div>
                <button type="button" onClick={onClose} aria-label={t('admin.promptMap.close')} className="rounded p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
            </header>
            <div className="space-y-3 overflow-y-auto px-4 py-3">
                <label className="block text-xs font-medium text-slate-500">{t('admin.counselors.persona')}
                    <textarea autoFocus value={draft} onChange={event => setDraft(event.target.value)} rows={12}
                        className="mt-1 w-full rounded border border-slate-300 p-2 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500" />
                </label>
                {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
                <PromptHistory scope="counselor_persona" targetKey={String(counselor.id)} currentValue={counselor.persona} onRestored={onSaved} />
            </div>
            <footer className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3">
                <button type="button" onClick={onClose} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">{t('admin.promptMap.cancel')}</button>
                <button type="button" onClick={save} disabled={saving} className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                    {saving ? t('admin.promptMap.saving') : t('admin.promptMap.save')}
                </button>
            </footer>
        </div>
    </div>, document.body);
}

function LevelHeading({ level, title, hint, count }: { level: PromptMapLevel; title: string; hint: string; count?: number }) {
    return <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
            <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-800">
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs ${LEVEL_STYLE[level]}`}>{LEVELS.indexOf(level) + 1}</span>
                {title}
            </h4>
            <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
        </div>
        {count !== undefined && <span className="text-xs text-slate-400">{count}</span>}
    </header>;
}

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
    const [instruments, setInstruments] = useState<PromptMapInstrument[]>([]);
    const [instrument, setInstrument] = useState(readInstrumentParam);
    const [map, setMap] = useState<PromptMapData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [stepId, setStepId] = useState('');
    const [highlight, setHighlight] = useState('');
    const [persona, setPersona] = useState<PromptMapCounselor | null>(null);
    const [overrideFor, setOverrideFor] = useState('');
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

    const load = useCallback(async (target: string, keepStep = false) => {
        setLoading(true);
        setError(false);
        try {
            const response = await apiFetch(`/api/admin/prompt-map?instrument=${encodeURIComponent(target)}`);
            if (!response.ok) throw new Error('map');
            const data: PromptMapData = await response.json();
            setMap(data);
            setStepId(current => keepStep && data.levels.steps.some(step => step.id === current) ? current : data.levels.steps[0]?.id || '');
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
        void load(instrument, true);
    }, [instrument, load, t]);

    useEffect(() => {
        if (!status) return;
        const timer = setTimeout(() => setStatus(''), 2500);
        return () => clearTimeout(timer);
    }, [status]);

    const goTo = (key: string) => {
        if (!map) return;
        const owner = map.levels.steps.find(step => step.entries.some(entry => entry.key === key));
        if (owner) setStepId(owner.id);
        setHighlight(key);
        requestAnimationFrame(() => document.getElementById(entryAnchor(key))?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        setTimeout(() => setHighlight(current => (current === key ? '' : current)), 2200);
    };
    const scrollToLevel = (level: PromptMapLevel) => document.getElementById(levelAnchor(level))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const selectStep = (id: string) => {
        setStepId(id);
        setOverrideFor('');
        requestAnimationFrame(() => document.getElementById(stepAnchor(id))?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    };

    const counts = map ? levelCounts(map) : null;
    const instrumentName = map ? name(map.instrument) : '';
    const step = map?.levels.steps.find(item => item.id === stepId);
    const card = (entry: PromptMapEntry) => <EntryCard key={entry.key} entry={entry} highlighted={highlight === entry.key}
        componentLabels={componentLabels} onSaved={reload} onEditPersona={setPersona} />;

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
                    <button type="button" onClick={() => instrument && void load(instrument, true)} disabled={loading}
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

        {map && counts && <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6">
            {/* Mobile: barra dei livelli orizzontale; desktop: colonna sticky con gli step. */}
            <nav aria-label={t('admin.promptMap.levels')} className="sticky top-0 z-20 -mx-4 mb-3 flex gap-2 overflow-x-auto border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur lg:hidden">
                {LEVELS.map(level => <button key={level} type="button" onClick={() => scrollToLevel(level)}
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${LEVEL_STYLE[level]}`}>
                    {LEVEL_NUMBER[level]} {level === 'instrument' ? map.instrument : t(`admin.promptMap.levelShort.${level}`)}
                </button>)}
            </nav>
            <nav aria-label={t('admin.promptMap.levels')} className="hidden self-start lg:sticky lg:top-4 lg:block">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">{t('admin.promptMap.levels')}</p>
                <ul className="space-y-1 text-sm">
                    {LEVELS.map(level => <li key={level}>
                        <button type="button" onClick={() => scrollToLevel(level)} className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left hover:bg-slate-100">
                            <span className="flex items-center gap-2 text-slate-700"><span className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${LEVEL_STYLE[level]}`}>{LEVELS.indexOf(level) + 1}</span>
                                {level === 'instrument' ? map.instrument : t(`admin.promptMap.levelShort.${level}`)}</span>
                            <span className="text-xs text-slate-400">{counts[level]}</span>
                        </button>
                        {level === 'step' && <ul className="ml-4 mt-1 space-y-0.5 border-l border-slate-200 pl-2">
                            {map.levels.steps.map(item => <li key={item.id}>
                                <button type="button" onClick={() => selectStep(item.id)} aria-current={item.id === stepId ? 'step' : undefined}
                                    className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs ${item.id === stepId ? 'bg-violet-50 font-semibold text-violet-800' : 'text-slate-600 hover:bg-slate-50'}`}>
                                    <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${item.fixed ? 'border border-slate-400' : COLOR_DOT[item.color_theme || ''] || 'bg-slate-400'}`} />
                                    <span className="truncate">{stepTitle(item, lang, t)}</span>
                                </button>
                            </li>)}
                        </ul>}
                    </li>)}
                </ul>
            </nav>

            <div className="min-w-0 space-y-8">
                <section id={levelAnchor('common')} className="scroll-mt-16">
                    <LevelHeading level="common" title={t('admin.promptMap.level.common')} hint={t('admin.promptMap.level.commonHint')} count={counts.common} />
                    <div className="space-y-3">{map.levels.common.map(card)}</div>
                </section>

                <section id={levelAnchor('group')} className="scroll-mt-16">
                    <LevelHeading level="group" title={t('admin.promptMap.level.group')} hint={t('admin.promptMap.level.groupHint')} count={counts.group} />
                    {map.levels.groups.length === 0 && <p className="text-xs text-slate-500">{t('admin.promptMap.emptyGroups')}</p>}
                    <div className="space-y-4">
                        {map.levels.groups.map(group => <div key={group.instruments.join('|')} className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                            <p className="text-xs font-semibold text-amber-900">{group.instruments.map(name).join(' · ')}</p>
                            <p className="mt-1 text-xs text-amber-800">⚠ {t('admin.promptMap.groupWarning')}</p>
                            <div className="mt-3 space-y-3">{group.entries.map(card)}</div>
                        </div>)}
                    </div>
                </section>

                <section id={levelAnchor('instrument')} className="scroll-mt-16">
                    <LevelHeading level="instrument" title={t('admin.promptMap.level.instrument', { name: instrumentName })} hint={t('admin.promptMap.level.instrumentHint')} count={counts.instrument} />
                    {map.levels.instrument.length === 0 && <p className="text-xs text-slate-500">{t('admin.promptMap.emptyLevel')}</p>}
                    <div className="space-y-3">{map.levels.instrument.map(card)}</div>
                </section>

                <section id={levelAnchor('step')} className="scroll-mt-16">
                    <LevelHeading level="step" title={t('admin.promptMap.level.step')} hint={t('admin.promptMap.level.stepHint')} count={counts.step} />
                    <label className="mb-3 flex flex-col text-xs font-semibold text-slate-600 lg:hidden">
                        {t('admin.promptMap.stepSelect')}
                        <select aria-label={t('admin.promptMap.stepSelect')} value={stepId} onChange={event => selectStep(event.target.value)} className="mt-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
                            {map.levels.steps.map(item => <option key={item.id} value={item.id}>{stepTitle(item, lang, t)}</option>)}
                        </select>
                    </label>
                    {step && <div id={stepAnchor(step.id)} className="scroll-mt-16 rounded-lg border border-violet-200 bg-violet-50/30 p-3 sm:p-4">
                        <header className="mb-3 flex flex-wrap items-center gap-2">
                            <span aria-hidden className={`h-3 w-3 rounded-full ${step.fixed ? 'border border-slate-400' : COLOR_DOT[step.color_theme || ''] || 'bg-slate-400'}`} />
                            <h5 className="text-sm font-bold text-slate-800">{stepTitle(step, lang, t)}</h5>
                            <code className="font-mono text-[11px] text-slate-500">{step.id}</code>
                            {step.system_prompt_mode && <span className="text-[11px] text-slate-500">{t('admin.promptMap.mode', { mode: step.system_prompt_mode })}</span>}
                            {step.fixed && <span className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">{t('admin.promptMap.fixedPhase')}</span>}
                        </header>
                        <div className="space-y-3">
                            {step.entries.map(card)}
                            {step.refs.filter(item => item.role === 'meta' && item.override_key === overrideFor).map(item => <EntryCard key={`override-${item.override_key}`} initiallyEditing
                                componentLabels={componentLabels} onSaved={reload} onEditPersona={setPersona} onCloseEditor={() => setOverrideFor('')}
                                entry={{
                                    key: item.override_key || '', kind: 'config', role: 'meta_step', level: 'step', destination: 'model', when: 'every_turn',
                                    value: findEntry(map, item.key)?.value ?? '', stored: false, shared: false,
                                    used_by: { instruments: [map.instrument], steps: [{ instrument: map.instrument, step_id: step.id, label: step.label }] },
                                    editor: { method: 'POST', path: '/admin/config' }, read_only: false,
                                }} />)}
                        </div>
                        {step.refs.length > 0 && <div className="mt-4">
                            <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">{t('admin.promptMap.inherited')}</p>
                            <ul className="space-y-2">
                                {step.refs.map(item => <RefRow key={`${item.key}-${item.role}`} map={map} refItem={item} onGo={goTo}
                                    onOverride={item.role === 'meta' && item.override_key ? () => setOverrideFor(item.override_key || '') : undefined} />)}
                            </ul>
                        </div>}
                        {!step.fixed && <div className="mt-4"><StepPreview key={`${map.instrument}-${step.id}`} map={map} step={step} componentLabels={componentLabels} /></div>}
                    </div>}
                </section>
            </div>
        </div>}

        {persona && <PersonaDialog counselor={persona} onClose={() => setPersona(null)} onSaved={() => { setPersona(null); reload(); }} />}
    </section>;
}
