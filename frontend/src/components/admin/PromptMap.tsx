'use client';

import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowDownRight, ArrowRight, ChevronDown, ChevronRight, ChevronUp, Layers, Pencil, Play, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { notifyPromptSaved } from '@/components/admin/PromptHealthPanel';
import { promptHealthId } from '@/lib/prompt-health';
import { apiFetch } from '@/lib/auth';
import { PromptHistory } from '@/components/admin/PromptHistory';
import { PromptRequestPreview } from '@/components/admin/PromptRequestPreview';
import { CreateInstrumentDialog } from '@/components/admin/CreateInstrumentDialog';
import { AdminChatSandboxModal } from '@/components/admin/AdminChatSandboxModal';
import { estimateTokens } from '@/lib/context-tokens';
import type { AdminGuidedStepQuestion } from '@/lib/guided-step-questions';
import {
    PROMPT_MAP_LANGUAGES, badgeFor, booleanFlags, componentsValue, entryAnchor, entryText, findEntry, levelAnchor, levelCounts,
    levelSection, moveItem, needsSharedConfirm, normalizeStepId, saveRequest, sectionDefaultOpen, sectionsForEntry, skillConditionParts, sortOrderChanges, stepAnchor, stepSection, stepsByInstrument,
    type PromptMap as PromptMapData, type PromptMapBadge, type PromptMapCounselor, type PromptMapEntry, type PromptMapInstrument,
    type PromptMapLevel, type PromptMapRef, type PromptMapSkill, type PromptMapStep, type PromptMapStrategyOptions, type PromptMapUser,
} from '@/lib/prompt-map';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';

// Vista "Mappa dei prompt": i testi delle chat guidate di uno strumento dal
// comune al particolare (docs/operations/admin-prompt-map.md). Livelli, chiavi
// e destinazioni arrivano da GET /api/admin/prompt-map; i salvataggi passano
// dalle API esistenti, che scrivono lo storico delle revisioni.

const INSTRUMENT_PARAM = 'instrument';
const LEVELS: PromptMapLevel[] = ['common', 'group', 'instrument', 'step'];
const LEVEL_NUMBER: Record<PromptMapLevel, string> = { common: '①', group: '②', instrument: '③', step: '④' };
export const LEVEL_STYLE: Record<PromptMapLevel, string> = {
    common: 'border-line-strong bg-surface-sunken text-ink-body',
    group: 'border-warning-line bg-warning-soft text-warning-ink',
    instrument: 'border-brand-line bg-brand-soft text-link',
    step: 'border-violet-300 bg-violet-50 text-violet-800',
};
const BADGE_STYLE: Record<PromptMapBadge, string> = {
    'model-entry': 'border-brand-line bg-brand-soft text-link',
    'model-turn': 'border-brand-line bg-surface text-link',
    'model-follow-up': 'border-info-line bg-info-soft text-info',
    student: 'border-success-line bg-success-soft text-success',
    admin: 'border-line bg-surface-raised text-ink-muted',
    context: 'border-warning-line bg-warning-soft text-warning-ink',
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
    return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-1 text-2xs font-semibold tracking-wide ${BADGE_STYLE[kind]}`}>
        {(kind.startsWith('model-') || kind === 'student') && <ArrowRight aria-hidden className="h-2.5 w-2.5" />}
        {t(`admin.promptMap.badge.${kind}`)}
    </span>;
}

function LevelTag({ level, name }: { level: PromptMapLevel; name: string }) {
    const { t } = useI18n();
    return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-1 text-2xs font-semibold ${LEVEL_STYLE[level]}`}>
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
    if (entry.role === 'system_prompt_short') return t('admin.promptMap.role.system_prompt_short');
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
    return <details data-used-by-steps className="mt-1 text-2xs text-ink-muted">
        <summary className="cursor-pointer select-none">{t('admin.promptMap.stepCount', { count: steps.length })}</summary>
        <ul className="mt-1 space-y-1 pl-4">
            {stepsByInstrument(entry).filter(item => item.steps.length).map(item => <li key={item.instrument}>
                <span className="font-semibold text-ink-muted">{name(item.instrument)}:</span> {item.steps.map(step => userStepTitle(step, lang, t)).join(' · ')}
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

/** Modalità ammesse per uno step, dall'API (il pannello non ne tiene una copia). */
function useStepModes(enabled = true) {
    const [modes, setModes] = useState<string[]>([]);
    useEffect(() => {
        if (!enabled) return;
        apiFetch(`${STEPS_API}/modes`)
            .then(response => response.ok ? response.json() : Promise.reject(new Error('modes')))
            .then((items: { mode: string }[]) => setModes(items.map(item => item.mode)))
            .catch(() => setModes(['generic']));
    }, [enabled]);
    return modes;
}

interface StrategyChoice { id: string; label: string; kind: 'approved' | 'certified' }
interface ApprovedStrategyRow { id: string; questionnaires?: string[]; texts?: Record<string, string> }
interface CertifiedStrategyRow { slug: string; questionnaire_types?: string[]; is_active?: boolean; [key: `name_${string}`]: string | undefined }

/** Limite delle strategie certificate e strategie consentite dello step (nel JSON dei componenti). */
function StrategyOptionsEditor({ instrument, options, onChange }: {
    instrument: string;
    options: PromptMapStrategyOptions;
    onChange: (patch: Partial<PromptMapStrategyOptions>) => void;
}) {
    const { t, lang } = useI18n();
    const [choices, setChoices] = useState<StrategyChoice[] | null>(null);
    const [error, setError] = useState(false);
    useEffect(() => {
        const code = instrument.toUpperCase();
        const matches = (codes?: string[]) => (codes ?? []).some(item => item.toUpperCase() === code);
        const json = (url: string) => apiFetch(url).then(response => response.ok ? response.json() : Promise.reject(new Error(url)));
        Promise.all([json('/api/admin/approved-strategies'), json('/api/admin/certified-strategies')])
            .then(([approved, certified]: [{ strategies?: ApprovedStrategyRow[] }, CertifiedStrategyRow[]]) => setChoices([
                ...(approved.strategies ?? []).filter(row => matches(row.questionnaires))
                    .map(row => ({ id: row.id, label: row.texts?.[lang] || row.texts?.it || row.id, kind: 'approved' as const })),
                ...(Array.isArray(certified) ? certified : []).filter(row => row.is_active && matches(row.questionnaire_types))
                    .map(row => ({ id: row.slug, label: row[`name_${lang}`] || row.name_it || row.slug, kind: 'certified' as const })),
            ]))
            .catch(() => setError(true));
    }, [instrument, lang]);
    const allowed = options.allowed_strategies;
    const toggle = (id: string) => {
        const current = allowed ?? (choices ?? []).map(choice => choice.id);
        onChange({ allowed_strategies: current.includes(id) ? current.filter(item => item !== id) : [...current, id] });
    };
    return <fieldset data-strategy-options className="space-y-2 rounded border border-line p-2">
        <legend className="px-1 text-xs font-semibold text-ink-muted">{t('admin.promptMap.strategies.title')}</legend>
        <label className="flex flex-wrap items-center gap-2 text-xs text-ink-body">
            {t('admin.promptMap.strategies.limit')}
            <select value={options.certified_strategy_limit} disabled={!options.certified_strategy_limit_editable}
                onChange={event => onChange({ certified_strategy_limit: Number(event.target.value) })}
                className="rounded border border-line-strong bg-surface px-2 py-1 text-xs disabled:bg-surface-raised">
                <option value={0}>{t('admin.promptMap.strategies.limitNone')}</option>
                <option value={1}>1</option>
            </select>
        </label>
        {!options.certified_strategy_limit_editable && <p className="text-2xs text-ink-muted">{t('admin.promptMap.strategies.limitLocked')}</p>}
        {error && <p role="alert" className="text-xs text-danger-ink">{t('admin.promptMap.strategies.loadError')}</p>}
        {(['approved', 'certified'] as const).map(kind => {
            const rows = (choices ?? []).filter(choice => choice.kind === kind);
            return rows.length > 0 && <div key={kind}>
                <p className="text-2xs font-semibold text-ink-muted">{t('admin.promptMap.strategies.allowed')} · {t(`admin.promptMap.strategies.${kind}`)}</p>
                <div className="mt-1 grid max-h-40 gap-1 overflow-y-auto">
                    {rows.map(choice => <label key={choice.id} className="flex items-start gap-2 text-xs text-ink-body">
                        <input type="checkbox" className="mt-1" checked={!allowed || allowed.includes(choice.id)} onChange={() => toggle(choice.id)} />
                        <span><code className="mr-1 text-2xs text-ink-muted">{choice.id}</code>{choice.label}</span>
                    </label>)}
                </div>
            </div>;
        })}
    </fieldset>;
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
    // Solo le opzioni toccate: le altre restano quelle salvate (o il default della chat).
    const [strategyOptions, setStrategyOptions] = useState<Partial<PromptMapStrategyOptions>>({});
    const [confirming, setConfirming] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const isComponents = entry.role === 'components';
    const isColor = entry.kind === 'guided_step' && entry.field === 'color_theme';
    const isMode = entry.kind === 'guided_step' && entry.field === 'system_prompt_mode';
    const modes = useStepModes(isMode);
    const shared = needsSharedConfirm(entry);

    const save = async () => {
        if (shared && !confirming) { setConfirming(true); return; }
        setSaving(true);
        setError('');
        try {
            const value = isComponents ? componentsValue(entry.value, flags, strategyOptions) : draft;
            const request = saveRequest(entry, value, multilingual ? language : 'it');
            const response = await apiFetch(request.url, {
                method: request.method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request.body),
            });
            if (!response.ok) throw new Error('save');
            // Solo avvisi (#760): il controllo parte dopo il salvataggio e non lo blocca.
            if (!isComponents && (!multilingual || language === 'it')) void notifyPromptSaved(promptHealthId(entry));
            onSaved();
        } catch {
            setError(t('admin.promptMap.saveError'));
        } finally {
            setSaving(false);
        }
    };

    return <div className="mt-4 space-y-4">
        {!isComponents && <p data-token-estimate className="text-xs text-ink-muted">{t('admin.context.tokens', { count: estimateTokens(draft) })}</p>}
        {multilingual && <label className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
            {t('admin.promptMap.language')}
            <select value={language} onChange={event => { setLanguage(event.target.value); setDraft(entryText(entry, event.target.value)); setConfirming(false); }}
                className="rounded border border-line-strong bg-surface px-2 py-1 text-xs">
                {PROMPT_MAP_LANGUAGES.map(code => <option key={code} value={code}>{code.toUpperCase()}</option>)}
            </select>
        </label>}
        {isComponents ? <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-1 text-xs text-ink-muted">{t('admin.promptMap.componentsHint')}</legend>
            {Object.entries(flags).map(([flag, on]) => <label key={flag} className="flex items-center gap-2 text-xs text-ink-body">
                <input type="checkbox" checked={on} onChange={event => { setFlags({ ...flags, [flag]: event.target.checked }); setConfirming(false); }} />
                {componentLabels?.[flag] || flag}
            </label>)}
            {entry.options && <div className="sm:col-span-2">
                <StrategyOptionsEditor instrument={entry.used_by.instruments[0] || ''} options={{ ...entry.options, ...strategyOptions }}
                    onChange={patch => { setStrategyOptions({ ...strategyOptions, ...patch }); setConfirming(false); }} />
            </div>}
        </fieldset> : isColor ? <select aria-label={t('admin.promptMap.field.color_theme')} value={draft} onChange={event => setDraft(event.target.value)}
            className="rounded border border-line-strong bg-surface px-2 py-2 text-sm">
            {COLOR_THEMES.map(color => <option key={color} value={color}>{t(`admin.color.${color}`)}</option>)}
        </select> : isMode ? <select aria-label={t('admin.promptMap.field.system_prompt_mode')} value={draft} onChange={event => setDraft(event.target.value)}
            className="rounded border border-line-strong bg-surface px-2 py-2 text-sm">
            {(modes.includes(draft) ? modes : [draft, ...modes]).map(item => <option key={item} value={item}>{item}</option>)}
        </select> : entry.kind === 'guided_step' && entry.field === 'label' ? <input id={fieldId} aria-label={t('admin.promptMap.field.label')} value={draft}
            onChange={event => { setDraft(event.target.value); setConfirming(false); }}
            className="w-full rounded border border-line-strong bg-surface px-2 py-2 text-sm" /> : <textarea id={fieldId} aria-label={entry.key} value={draft}
            onChange={event => { setDraft(event.target.value); setConfirming(false); }} rows={Math.min(18, Math.max(6, draft.split('\n').length + 1))}
            className="w-full rounded border border-line-strong bg-surface p-2 font-mono text-xs leading-relaxed text-ink outline-none focus:ring-2 focus:ring-focus" />}
        {confirming && <p role="alert" className="rounded border border-warning-line bg-warning-soft px-4 py-2 text-xs text-warning-ink">
            {t('admin.promptMap.sharedWarning', { users: sharedUsers(entry, name, t) })}
        </p>}
        {error && <p role="alert" className="text-xs text-danger-ink">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" type="button" onClick={onCancel} className="text-xs">
                {t('admin.promptMap.cancel')}
            </Button>
            <button type="button" onClick={save} disabled={saving}
                className={`min-h-control rounded px-4 py-2 text-xs font-semibold text-ink-on-brand disabled:opacity-60 ${confirming ? 'bg-warning hover:bg-warning' : 'bg-brand hover:bg-brand-hover'}`}>
                {saving ? t('admin.promptMap.saving') : confirming ? t('admin.promptMap.saveForAll') : t('admin.promptMap.save')}
            </button>
        </div>
        {entry.kind === 'config' && <PromptHistory scope="config" targetKey={multilingual && language !== 'it' ? `${entry.key}__${language}` : entry.key}
            currentValue={entryText(entry, multilingual ? language : 'it')} onRestored={onSaved} />}
        {entry.kind === 'guided_step' && entry.field === 'prompt' && <PromptHistory scope="guided_step" targetKey={entry.editor.path.split('/').pop() || ''}
            currentValue={String(entry.value ?? '')} onRestored={onSaved} />}
    </div>;
}

function VariantButtons({ variants, selected, disabled, onSelect }: {
    variants: Record<string, PromptMapEntry>; selected: string; disabled?: boolean; onSelect: (level: string) => void;
}) {
    const { t } = useI18n();
    return <div role="group" aria-label={t('admin.context.variants')} className="mt-2 flex flex-wrap gap-2">
        {['totale', ...Object.keys(variants)].map(level => <button key={level} type="button" disabled={disabled}
            aria-pressed={selected === level} onClick={() => onSelect(level)}
            className={`min-h-control rounded border px-2 py-1 text-xs font-semibold disabled:opacity-60 ${selected === level ? 'border-brand bg-brand text-ink-on-brand' : 'border-line-strong bg-surface text-ink-body hover:bg-surface-sunken'}`}>
            {variants[level]?.context_label || t('admin.context.total')}
        </button>)}
    </div>;
}

function EntryCard({ entry: baseEntry, highlighted, onSaved, onEditPersona, onEditQuestions, componentLabels, initiallyEditing = false, onCloseEditor }: {
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
    const [level, setLevel] = useState('totale');
    const entry = baseEntry.variants?.[level] || baseEntry;
    const close = () => { setEditing(false); onCloseEditor?.(); };
    const text = entry.kind === 'config' || entry.kind === 'guided_step' ? entryText(entry, entry.destination === 'student' && entry.translations ? lang : 'it') : '';
    const counselors = entry.kind === 'counselor_persona' ? entry.value as PromptMapCounselor[] : [];
    const questions = entry.kind === 'step_questions' ? entry.value as Record<string, string[]> : {};
    const flags = entry.role === 'components' ? booleanFlags(entry.effective) : {};

    return <article id={entryAnchor(baseEntry.key)} data-entry-key={baseEntry.key}
        className={`scroll-mt-24 rounded-lg border bg-surface p-4 shadow-card transition-shadow sm:p-4 ${highlighted ? 'border-brand ring-2 ring-brand-line' : 'border-line'}`}>
        <header className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
                <h5 className="text-sm font-semibold text-ink">{entryTitle(baseEntry, t, tf)}</h5>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-ink-muted">
                    {entry.kind === 'config' && <code className="break-all font-mono">{entry.key}</code>}
                    <UsedBy entry={entry} />
                    {entry.kind === 'config' && !entry.stored && <span className="italic">{t('admin.promptMap.notStored')}</span>}
                </p>
                <UsedBySteps entry={entry} />
            </div>
            <div className="flex flex-wrap items-center gap-1">
                {(entry.kind === 'config' || entry.kind === 'guided_step') && entry.role !== 'components' && <span data-token-estimate className="text-xs text-ink-muted">{t('admin.context.tokens', { count: estimateTokens(text) })}</span>}
                <Badge kind={badgeFor(entry)} />
                {entry.read_only && <span className="rounded border border-line px-2 py-1 text-2xs font-semibold text-ink-muted">{t('admin.promptMap.badge.readOnly')}</span>}
            </div>
        </header>

        {baseEntry.variants && <VariantButtons variants={baseEntry.variants} selected={level} disabled={editing} onSelect={setLevel} />}
        {entry.context_level && <p className="mt-2 text-xs text-ink-muted">{t('admin.context.variantHelp')}</p>}
        {entry.context_level && !text.trim() && !editing && <p className="mt-2 line-clamp-4 whitespace-pre-wrap break-words text-xs text-ink-muted">
            {entryText(baseEntry, 'it')}
        </p>}

        {entry.kind === 'counselor_persona' && <ul className="mt-4 space-y-2">
            {counselors.length === 0 && <li className="text-xs text-ink-muted">{t('admin.promptMap.noPersona')}</li>}
            {counselors.map(counselor => <li key={counselor.id} className="flex items-start gap-4 rounded border border-line bg-surface-sunken px-4 py-2">
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-ink-body">{counselor.name}</p>
                    <p data-token-estimate className="text-xs text-ink-muted">{t('admin.context.tokens', { count: estimateTokens(counselor.persona) })}</p>
                    <p className="line-clamp-2 whitespace-pre-wrap text-xs text-ink-muted">{counselor.persona || t('admin.promptMap.empty')}</p>
                    {counselor.variants && <VariantButtons variants={counselor.variants} selected="totale"
                        onSelect={level => onEditPersona({ ...counselor, context_level: level })} />}
                </div>
                <Button variant="secondary" type="button" onClick={() => onEditPersona(counselor)} aria-label={`${t('admin.promptMap.edit')} · ${counselor.name}`} title={t('admin.promptMap.edit')}
                    className="w-control px-0 shrink-0">
                    <Pencil aria-hidden className="h-3.5 w-3.5" />
                </Button>
            </li>)}
        </ul>}

        {entry.kind === 'step_questions' && <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
            {Object.keys(questions).length === 0 ? <p>{t('admin.promptMap.noQuestions')}</p>
                : <p>{Object.entries(questions).map(([code, items]) => `${code.toUpperCase()} ${items.length}`).join(' · ')}</p>}
            {onEditQuestions && <Button variant="secondary" type="button" onClick={() => onEditQuestions(entry)}
                aria-label={t('admin.promptMap.editQuestions')} title={t('admin.promptMap.editQuestions')}
                className="w-control px-0">
                <Pencil aria-hidden className="h-3.5 w-3.5" />
            </Button>}
        </div>}

        {entry.role === 'components' && !editing && <p className="mt-2 flex flex-wrap gap-1">
            {Object.entries(flags).map(([flag, on]) => <span key={flag} className={`rounded px-2 py-1 text-2xs ${on ? 'bg-success-soft text-success' : 'bg-surface-raised text-ink-muted line-through'}`}>
                {componentLabels?.[flag] || flag}
            </span>)}
        </p>}
        {entry.options && !editing && <p className="mt-1 text-2xs text-ink-muted">
            {t('admin.promptMap.strategies.limit')}: {entry.options.certified_strategy_limit || t('admin.promptMap.strategies.limitNone')}
            {' · '}{t('admin.promptMap.strategies.allowed')}: {entry.options.allowed_strategies
                ? t('admin.promptMap.strategies.allowedCount', { count: entry.options.allowed_strategies.length })
                : t('admin.promptMap.strategies.allowedAll')}
        </p>}

        {entry.kind === 'guided_step' && entry.field === 'color_theme' && !editing && <p className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
            <span aria-hidden className={`h-3 w-3 rounded-full ${COLOR_DOT[text] || 'bg-ink-muted'}`} />{t(`admin.color.${text}`)}
        </p>}

        {(entry.kind === 'config' && entry.role !== 'components') || (entry.kind === 'guided_step' && entry.field !== 'color_theme') ? !editing && <p className="mt-2 line-clamp-4 whitespace-pre-wrap break-words text-xs leading-relaxed text-ink-muted">
            {text || t('admin.promptMap.empty')}
        </p> : null}

        {!entry.read_only && entry.kind !== 'step_questions' && !editing && <div className="mt-2 flex justify-end">
            <Button variant="secondary" type="button" onClick={() => setEditing(true)}
                aria-label={t('admin.promptMap.edit')} title={t('admin.promptMap.edit')}
                className="w-control px-0">
                <Pencil aria-hidden className="h-3.5 w-3.5" />
            </Button>
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
    return <li className="rounded border border-dashed border-line bg-surface-sunken/70 px-4 py-2 text-ink-muted">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="font-semibold text-ink-muted">{target ? entryTitle(target, t, tf) : t(`admin.promptMap.role.${refItem.role}`)}</span>
            <code className="break-all font-mono text-2xs">{refItem.key}</code>
            <Badge kind={badgeFor({ destination: target?.destination ?? 'model', when: refItem.when })} />
            <span className="inline-flex items-center gap-1">
                {t('admin.promptMap.inheritedFrom')} <LevelTag level={refItem.level} name={name(map.instrument)} />
            </span>
            <button type="button" onClick={() => onGo(refItem.key)} className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
                {t('admin.promptMap.goTo')}<ArrowDownRight aria-hidden className="h-3 w-3 -rotate-90" />
            </button>
            {onOverride && <button type="button" onClick={onOverride} className="font-semibold text-ink-muted underline-offset-2 hover:underline">
                {t('admin.promptMap.overrideMeta')}
            </button>}
        </div>
        {text && <p className="mt-1 line-clamp-1 break-words text-2xs text-ink-muted">{text}</p>}
    </li>;
}

// Skill che la chat aggancia allo step: quando entrano, dove vanno nel prompt
// e, per quelle che oggi restano fuori, perche'. Si modificano nella scheda Skill.
function StepSkills({ skills, engineOn }: { skills: PromptMapSkill[]; engineOn: boolean }) {
    const { t } = useI18n();
    return <div data-step-skills className="mt-4">
        <p className="mb-1 text-2xs font-semibold text-ink-muted">{t('admin.promptMap.skills.title')}</p>
        <p className="mb-2 text-2xs text-ink-muted">{t('admin.promptMap.skills.hint')}</p>
        {!engineOn && <p className="mb-2 flex items-center gap-1 rounded bg-warning-soft px-2 py-1 text-xs text-warning-ink">
            <AlertTriangle aria-hidden className="h-3.5 w-3.5" />{t('admin.promptMap.skills.engineOff')}
        </p>}
        {skills.length === 0 ? <p className="text-xs text-ink-muted">{t('admin.promptMap.skills.none')}</p> : <ul className="space-y-2">
            {skills.map(skill => {
                const off = skill.blocked.length > 0 || !engineOn;
                return <li key={skill.id} className={`rounded border px-4 py-2 text-xs ${off ? 'border-dashed border-line bg-surface-sunken/70 text-ink-muted' : 'border-violet-200 bg-violet-50/60 text-ink-body'}`}>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold">{skill.name}</span>
                        <code className="font-mono text-2xs">{skill.slug}</code>
                        <span className="rounded bg-surface px-2 py-1 text-2xs ring-1 ring-line">{t(`admin.promptMap.skills.routing.${skill.routing}`)}</span>
                        <span className="rounded bg-surface px-2 py-1 text-2xs ring-1 ring-line">{t(`admin.promptMap.skills.slot.${skill.slot}`)}</span>
                        <span className="text-2xs">{t(skill.binding === 'step' ? 'admin.promptMap.skills.bindingStep' : 'admin.promptMap.skills.bindingAll')}</span>
                        <a href={`/admin?tab=skills&skill=${skill.id}`} className="inline-flex items-center gap-1 font-semibold text-brand hover:underline">
                            <Pencil aria-hidden className="h-3 w-3" />{t('admin.promptMap.skills.edit')}
                        </a>
                    </div>
                    <p className="mt-1">
                        <span className="font-semibold">{t('admin.promptMap.skills.whenLabel')}</span>{' '}
                        {skillConditionParts(skill).map(part => t(part.key, part.params)).join(' · ')}
                    </p>
                    {skill.blocked.length > 0 && <p className="mt-1 text-warning-ink">
                        {t('admin.promptMap.skills.blockedLabel')} {skill.blocked.map(reason => t(`admin.promptMap.skills.blocked.${reason}`)).join(' · ')}
                    </p>}
                    {skill.knowledge_off && <p className="mt-1 text-warning-ink">{t('admin.promptMap.skills.knowledgeOff')}</p>}
                </li>;
            })}
        </ul>}
    </div>;
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
        <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-xl bg-surface shadow-modal sm:rounded-card">
            <header className="flex items-start justify-between gap-4 border-b border-line px-4 py-4">
                <div className="min-w-0">
                    <h4 id={titleId} className="break-words text-sm font-semibold text-ink">{title}</h4>
                    {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
                </div>
                <button type="button" onClick={onClose} aria-label={t('admin.promptMap.close')} className="inline-flex min-h-control min-w-control items-center justify-center rounded p-2 text-ink-muted hover:bg-surface-raised"><X className="h-4 w-4" /></button>
            </header>
            <div className="space-y-4 overflow-y-auto px-4 py-4">{children}</div>
            {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line px-4 py-4">{footer}</footer>}
        </div>
    </div>, document.body);
}

function PersonaDialog({ counselor, onClose, onSaved }: { counselor: PromptMapCounselor; onClose: () => void; onSaved: () => void }) {
    const { t } = useI18n();
    const level = counselor.context_level || 'totale';
    const variant = counselor.variants?.[level];
    const current = variant ? String(variant.value ?? '') : counselor.persona;
    const [draft, setDraft] = useState(current);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const save = async () => {
        setSaving(true);
        setError('');
        try {
            // Stessa API e stesso formato del tab Counselor (CounselorsPanel).
            const request = variant ? saveRequest(variant, draft) : {
                url: `/api/admin/counselors/${counselor.id}`, method: 'PUT', body: { persona: draft.trim() || null },
            };
            const response = await apiFetch(request.url, { method: request.method,
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request.body) });
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
            <Button variant="secondary" type="button" onClick={onClose} className="text-xs">{t('admin.promptMap.cancel')}</Button>
            <Button type="button" onClick={save} disabled={saving} className="text-xs">
                {saving ? t('admin.promptMap.saving') : t('admin.promptMap.save')}
            </Button>
        </>}>
        {variant && <p className="text-xs text-ink-muted">{variant.context_label} · {t('admin.context.variantHelp')}</p>}
        <label className="block text-xs font-semibold text-ink-muted">{t('admin.counselors.persona')}
            <textarea autoFocus value={draft} onChange={event => setDraft(event.target.value)} rows={12}
                className="mt-1 w-full rounded border border-line-strong p-2 text-sm text-ink outline-none focus:ring-2 focus:ring-focus" />
        </label>
        <p data-token-estimate className="text-xs text-ink-muted">{t('admin.context.tokens', { count: estimateTokens(draft) })}</p>
        {error && <p role="alert" className="text-xs text-danger-ink">{error}</p>}
        <PromptHistory scope={variant ? 'config' : 'counselor_persona'} targetKey={variant?.key || String(counselor.id)} currentValue={current} onRestored={onSaved} />
    </DialogShell>;
}

const QUESTIONS_API = '/api/admin/guided-step-questions';
const STEPS_API = '/api/admin/guided-steps';
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const ICON_BUTTON = 'inline-flex min-h-control min-w-control items-center justify-center rounded border border-line-strong bg-surface px-2 text-xs font-semibold text-ink-body hover:bg-surface-sunken disabled:opacity-40';

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
                    ...(request.body === undefined ? {} : { headers: JSON_HEADERS, body: JSON.stringify(request.body) }),
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

    return <DialogShell title={t('admin.promptMap.questions.title', { step: stepName })} hint={t('admin.promptMap.questions.hint')} onClose={close}
        footer={<Button variant="secondary" type="button" onClick={close} className="text-xs">{t('admin.promptMap.close')}</Button>}>
        <div role="group" aria-label={t('admin.promptMap.questions.languages')} className="flex flex-wrap gap-2">
            {PROMPT_MAP_LANGUAGES.map(code => <button key={code} type="button" aria-pressed={code === language}
                onClick={() => { setLanguage(code); setEditingId(null); setDeletingId(null); }}
                className={`min-h-control rounded-full border px-2 py-1 text-xs font-semibold ${code === language ? 'border-brand bg-brand text-ink-on-brand' : 'border-line-strong bg-surface text-ink-body hover:bg-surface-sunken'}`}>
                {code.toUpperCase()} {items ? byLanguage(code).length : ''}
            </button>)}
        </div>
        {error && <p role="alert" className="text-xs text-danger-ink">{error}</p>}
        {!items && !error && <p className="text-xs text-ink-muted">{t('admin.promptMap.loading')}</p>}
        {items && <ol aria-label={t('admin.promptMap.role.suggested_questions')} className="space-y-2">
            {list.length === 0 && <li className="text-xs text-ink-muted">{t('admin.promptMap.questions.empty')}</li>}
            {list.map((row, index) => <li key={row.id} data-question-id={row.id} className="rounded border border-line bg-surface-sunken px-4 py-2">
                {editingId === row.id ? <div className="space-y-2">
                    <textarea autoFocus aria-label={t('admin.promptMap.edit')} value={editText} onChange={event => setEditText(event.target.value)} rows={3}
                        className="w-full rounded border border-line-strong bg-surface p-2 text-sm text-ink outline-none focus:ring-2 focus:ring-focus" />
                    <p data-token-estimate className="text-xs text-ink-muted">{t('admin.context.tokens', { count: estimateTokens(editText) })}</p>
                    <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="secondary" type="button" onClick={() => setEditingId(null)} className="text-xs">{t('admin.promptMap.cancel')}</Button>
                        <Button type="button" disabled={busy || !editText.trim()} onClick={() => run([{ url: `${QUESTIONS_API}/${row.id}`, method: 'PUT', body: { text: editText.trim() } }])}
                            className="text-xs">{t('admin.promptMap.save')}</Button>
                    </div>
                </div> : <div className="flex flex-wrap items-start gap-2">
                    <p className="min-w-0 flex-1 basis-48 whitespace-pre-wrap break-words text-sm text-ink-body">
                        <span className="mr-1 font-mono text-2xs text-ink-muted">{index + 1}.</span>{row.text}
                        <span data-token-estimate className="ml-2 text-xs text-ink-muted">{t('admin.context.tokens', { count: estimateTokens(row.text) })}</span>
                        {!row.is_active && <span className="ml-2 rounded border border-line-strong px-1 text-2xs font-semibold text-ink-muted">{t('admin.promptMap.questions.inactive')}</span>}
                    </p>
                    <div className="flex shrink-0 flex-wrap gap-1">
                        <button type="button" disabled={busy || index === 0} onClick={() => move(index, -1)} aria-label={t('admin.promptMap.questions.moveUp')} title={t('admin.promptMap.questions.moveUp')} className={ICON_BUTTON}><ChevronUp aria-hidden className="h-4 w-4" /></button>
                        <button type="button" disabled={busy || index === list.length - 1} onClick={() => move(index, 1)} aria-label={t('admin.promptMap.questions.moveDown')} title={t('admin.promptMap.questions.moveDown')} className={ICON_BUTTON}><ChevronDown aria-hidden className="h-4 w-4" /></button>
                        <button type="button" disabled={busy} onClick={() => { setEditingId(row.id); setEditText(row.text); setDeletingId(null); }} aria-label={t('admin.promptMap.edit')} title={t('admin.promptMap.edit')} className={ICON_BUTTON}><Pencil aria-hidden className="h-3.5 w-3.5" /></button>
                        {deletingId === row.id
                            ? <button type="button" disabled={busy} onClick={() => run([{ url: `${QUESTIONS_API}/${row.id}`, method: 'DELETE' }])}
                                className="min-h-control rounded bg-danger px-2 py-1 text-xs font-semibold text-ink-on-brand disabled:opacity-60">{t('admin.promptMap.questions.confirmDelete')}</button>
                            : <button type="button" disabled={busy} onClick={() => setDeletingId(row.id)} aria-label={t('admin.promptMap.questions.delete')} title={t('admin.promptMap.questions.delete')} className={`min-h-control ${ICON_BUTTON} text-danger-ink`}><Trash2 aria-hidden className="h-3.5 w-3.5" /></button>}
                    </div>
                </div>}
            </li>)}
        </ol>}
        {items && <div className="space-y-2 rounded border border-dashed border-line-strong p-4">
            <label className="block text-xs font-semibold text-ink-muted">{t('admin.promptMap.questions.new', { lang: language.toUpperCase() })}
                <textarea value={draft} onChange={event => setDraft(event.target.value)} rows={2}
                    className="mt-1 w-full rounded border border-line-strong bg-surface p-2 text-sm font-normal text-ink outline-none focus:ring-2 focus:ring-focus" />
            </label>
            <p data-token-estimate className="text-xs text-ink-muted">{t('admin.context.tokens', { count: estimateTokens(draft) })}</p>
            <div className="flex justify-end">
                <Button type="button" disabled={busy || !draft.trim()} onClick={add}
                    className="gap-1 text-xs"><Plus aria-hidden className="h-3.5 w-3.5" />{t('admin.promptMap.questions.add')}</Button>
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
            <Heading className={actions ? 'min-w-0 basis-full sm:basis-auto sm:flex-1' : 'min-w-0 flex-1'}>
                <button type="button" aria-expanded={open} aria-controls={open ? regionId : undefined} onClick={onToggle}
                    className="min-h-control flex w-full min-w-0 items-center gap-2 rounded py-1 text-left hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                    <ChevronRight aria-hidden className={`h-4 w-4 shrink-0 text-ink-muted transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-90' : ''}`} />
                    <span className="min-w-0 flex-1">{heading}</span>
                    {count && <span className="shrink-0 whitespace-nowrap text-xs font-normal normal-case tracking-normal text-ink-muted">{count}</span>}
                </button>
            </Heading>
            {actions}
        </div>
        {hint && <p className="pl-6 text-xs text-ink-muted">{hint}</p>}
        {open && <div id={regionId} className="mt-4">{children}</div>}
    </section>;
}

function LevelTitle({ level, title }: { level: PromptMapLevel; title: string }) {
    return <span className="flex items-center gap-2 text-sm font-semibold text-ink">
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
    // Compilazioni reali dello strumento: l'anteprima può usare i punteggi di una sessione.
    const [results, setResults] = useState<{ session_id: string; username?: string | null }[]>([]);
    useEffect(() => {
        if (!open) return;
        const code = map.instrument.toUpperCase();
        apiFetch('/api/admin/questionnaire-results?limit=100')
            .then(response => response.ok ? response.json() : [])
            .then((rows: { session_id: string; username?: string | null; questionnaire_type: string }[]) =>
                setResults(rows.filter(row => row.questionnaire_type.toUpperCase() === code)))
            .catch(() => setResults([]));
    }, [open, map.instrument]);
    const prompt = step.entries.find(entry => entry.kind === 'guided_step' && entry.field === 'prompt');
    return <div>
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
            className="min-h-control rounded border border-brand-line bg-surface px-4 py-2 text-sm font-semibold text-link hover:bg-brand-soft">
            {t('admin.promptMap.preview')}
        </button>
        {open && <div className="mt-4 space-y-2">
            <p className="flex flex-wrap items-center gap-2 text-2xs text-ink-muted">
                <span className="font-semibold">{t('admin.promptMap.previewLegend')}:</span>
                {LEVELS.map(level => <LevelTag key={level} level={level} name={name(map.instrument)} />)}
                <span className="rounded border border-line bg-surface-sunken px-2 py-1">{t('admin.promptMap.previewOther')}</span>
            </p>
            {/* Valori salvati: nessun override, l'anteprima legge il DB come la chat. */}
            <PromptRequestPreview configs={[]} results={results} componentLabels={componentLabels} followUpMode={step.follow_up_mode}
                step={{ id: step.id, prompt: String(prompt?.value ?? ''), questionnaire_type: map.instrument, system_prompt_mode: step.system_prompt_mode || 'generic' }}
                blockClassName={(key, origin) => {
                    const level = previewBlockLevel(map, step, key, origin);
                    return level ? LEVEL_BLOCK[level] : 'bg-surface-sunken';
                }} />
        </div>}
    </div>;
}

/** Riordino con l'API esistente (PATCH /admin/guided-steps/reorder), una sola richiesta. */
async function saveStepOrder(ordered: { id: string; sort_order: number }[]) {
    const changes = sortOrderChanges(ordered);
    if (!changes.length) return;
    const response = await apiFetch(`${STEPS_API}/reorder`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify(changes) });
    if (!response.ok) throw new Error('reorder');
}

function AddStepForm({ map, onCreated, onCancel }: { map: PromptMapData; onCreated: (stepId: string, positionFailed: boolean) => void; onCancel: () => void }) {
    const { t, lang } = useI18n();
    const steps = map.levels.steps.filter(step => !step.fixed);
    const [id, setId] = useState('');
    const [label, setLabel] = useState('');
    const [mode, setMode] = useState('generic');
    const modes = useStepModes();
    const [before, setBefore] = useState('');
    const [prompt, setPrompt] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const create = async () => {
        const stepId = normalizeStepId(id);
        if (!stepId || !label.trim()) return;
        if (map.levels.steps.some(step => step.id === stepId)) { setError(t('admin.promptMap.step.idTaken')); return; }
        setBusy(true);
        setError('');
        try {
            const sortOrder = steps.reduce((max, step) => Math.max(max, step.sort_order ?? 0), 0) + 1;
            // Stessa API e stesso formato di POST /admin/guided-steps.
            const response = await apiFetch(STEPS_API, {
                method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({
                    id: stepId, sort_order: sortOrder, label: label.trim(), prompt, system_prompt_mode: mode,
                    color_theme: 'blue', questionnaire_type: map.instrument,
                }),
            });
            if (!response.ok) { setError(t(response.status === 400 ? 'admin.promptMap.step.idTaken' : 'admin.promptMap.step.createError')); return; }
            const target = before ? steps.findIndex(step => step.id === before) : -1;
            let positionFailed = false;
            if (target >= 0) {
                const ordered = [...steps.map(step => ({ id: step.id, sort_order: step.sort_order ?? 0 })), { id: stepId, sort_order: sortOrder }];
                await saveStepOrder(moveItem(ordered, ordered.length - 1, target)).catch(() => { positionFailed = true; });
            }
            onCreated(stepId, positionFailed);
        } catch {
            setError(t('admin.promptMap.step.createError'));
        } finally {
            setBusy(false);
        }
    };

    const field = 'mt-1 w-full rounded border border-line-strong bg-surface px-2 py-2 text-sm font-normal text-ink';
    return <form aria-label={t('admin.promptMap.step.newTitle')} className="space-y-4 rounded-lg border border-dashed border-violet-300 bg-surface p-4"
        onSubmit={event => { event.preventDefault(); void create(); }}>
        <p className="text-sm font-semibold text-ink">{t('admin.promptMap.step.newTitle')}</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs font-semibold text-ink-muted">{t('admin.promptMap.step.id')}
                <input required value={id} onChange={event => { setId(normalizeStepId(event.target.value, false)); setError(''); }}
                    placeholder={`${map.instrument.toLowerCase()}-…`} className={`${field} font-mono`} />
                <span className="mt-1 block font-normal text-ink-muted">{t('admin.promptMap.step.idHint')}</span>
            </label>
            <label className="text-xs font-semibold text-ink-muted">{t('admin.promptMap.step.name')}
                <input required value={label} onChange={event => setLabel(event.target.value)} className={field} />
            </label>
            <label className="text-xs font-semibold text-ink-muted">{t('admin.promptMap.step.mode')}
                <select value={mode} onChange={event => setMode(event.target.value)} className={field}>
                    {(modes.includes(mode) ? modes : [mode, ...modes]).map(item => <option key={item} value={item}>{item}</option>)}
                </select>
            </label>
            <label className="text-xs font-semibold text-ink-muted">{t('admin.promptMap.step.position')}
                <select value={before} onChange={event => setBefore(event.target.value)} className={field}>
                    <option value="">{t('admin.promptMap.step.positionEnd')}</option>
                    {steps.map(step => <option key={step.id} value={step.id}>{t('admin.promptMap.step.positionBefore', { step: stepTitle(step, lang, t) })}</option>)}
                </select>
            </label>
        </div>
        <label className="block text-xs font-semibold text-ink-muted">{t('admin.promptMap.step.prompt')}
            <textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={3} className={`${field} font-mono text-xs`} />
        </label>
        {error && <p role="alert" className="text-xs text-danger-ink">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" type="button" onClick={onCancel} className="text-xs">{t('admin.promptMap.cancel')}</Button>
            <Button type="submit" disabled={busy || !normalizeStepId(id) || !label.trim()}
                className="text-xs">{busy ? t('admin.promptMap.saving') : t('admin.promptMap.step.create')}</Button>
        </div>
    </form>;
}

interface StepUsage {
    sessions: number;
    messages: number;
    suggested_questions: number;
    session_details: { session_id: string; messages: number }[];
}

/** Conferma esplicita: uso da parte degli studenti e id dello step digitato. Prompt e revisioni restano. */
function DeleteStepDialog({ step, stepName, onClose, onDeleted }: { step: PromptMapStep; stepName: string; onClose: () => void; onDeleted: () => void }) {
    const { t } = useI18n();
    const [usage, setUsage] = useState<StepUsage | null>(null);
    const [typed, setTyped] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        apiFetch(`${STEPS_API}/${encodeURIComponent(step.id)}/usage`)
            .then(response => response.ok ? response.json() : Promise.reject(new Error('usage')))
            .then(setUsage)
            .catch(() => setError(t('admin.promptMap.step.usageError')));
    }, [step.id, t]);

    const remove = async () => {
        setBusy(true);
        setError('');
        try {
            const response = await apiFetch(`${STEPS_API}/${encodeURIComponent(step.id)}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('delete');
            onDeleted();
        } catch {
            setError(t('admin.promptMap.step.deleteError'));
        } finally {
            setBusy(false);
        }
    };

    return <DialogShell title={t('admin.promptMap.step.deleteTitle', { step: stepName })} onClose={() => { if (!busy) onClose(); }}
        footer={<>
            <Button variant="secondary" type="button" disabled={busy} onClick={onClose} className="text-xs">{t('admin.promptMap.cancel')}</Button>
            <button type="button" onClick={remove} disabled={busy || !usage || typed !== step.id}
                className="min-h-control rounded bg-danger px-4 py-2 text-xs font-semibold text-ink-on-brand disabled:opacity-50">{busy ? t('admin.promptMap.saving') : t('admin.promptMap.step.deleteConfirm')}</button>
        </>}>
        {!usage && !error && <p className="text-xs text-ink-muted">{t('admin.promptMap.loading')}</p>}
        {usage && <div data-step-usage className={`rounded border px-4 py-2 text-sm ${usage.sessions ? 'border-warning-line bg-warning-soft text-warning-ink' : 'border-line bg-surface-sunken text-ink-body'}`}>
            <p className="text-xs font-semibold">{t('admin.promptMap.step.deleteUsage')}</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
                <li>{t('admin.promptMap.step.deleteSessions', { count: usage.sessions, messages: usage.messages })}</li>
                {usage.suggested_questions > 0 && <li>{t('admin.promptMap.step.deleteQuestions', { count: usage.suggested_questions })}</li>}
            </ul>
            {usage.session_details?.length > 0 && <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded border border-line bg-surface p-2 text-xs text-ink-body">
                {usage.session_details.map(session => <li key={session.session_id} className="flex flex-wrap justify-between gap-x-4">
                    <code data-session-id className="break-all font-mono">{session.session_id}</code>
                    <span>{t('admin.promptMap.step.sessionMessages', { count: session.messages })}</span>
                </li>)}
            </ul>}
        </div>}
        <p className="text-xs text-ink-muted">{t('admin.promptMap.step.deleteKeeps')}</p>
        <label className="block text-xs font-semibold text-ink-muted">{t('admin.promptMap.step.deleteConfirmLabel', { id: step.id })}
            <input autoFocus value={typed} onChange={event => setTyped(event.target.value)} autoComplete="off" spellCheck={false}
                className="mt-1 w-full rounded border border-line-strong bg-surface px-2 py-2 font-mono text-sm font-normal text-ink" />
        </label>
        {error && <p role="alert" className="text-xs text-danger-ink">{error}</p>}
    </DialogShell>;
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
    const [adding, setAdding] = useState(false);
    const [deleting, setDeleting] = useState<PromptMapStep | null>(null);
    const [structureBusy, setStructureBusy] = useState(false);
    const [structureError, setStructureError] = useState('');
    const [creatingInstrument, setCreatingInstrument] = useState(false);
    const [testingChat, setTestingChat] = useState(false);

    const handleInstrumentCreated = async (newCode: string) => {
        try {
            const response = await apiFetch('/api/admin/prompt-map/instruments');
            if (response.ok) {
                const items: PromptMapInstrument[] = await response.json();
                setInstruments(items);
            }
        } catch {
            // keep existing list
        }
        setInstrument(newCode);
        setStatus(t('admin.instrumentWizard.successMessage', { code: newCode }));
    };

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
            // Uno step appena creato compare solo dopo il ricaricamento della mappa.
            const target = document.getElementById(entryAnchor(pendingScroll));
            if (!target) return;
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setPendingScroll('');
        });
        return () => cancelAnimationFrame(frame);
    }, [pendingScroll, openSections, map]);

    const movable = map ? map.levels.steps.filter(step => !step.fixed) : [];
    const moveStep = async (index: number, delta: number) => {
        if (!map) return;
        setStructureBusy(true);
        setStructureError('');
        try {
            await saveStepOrder(moveItem(movable.map(step => ({ id: step.id, sort_order: step.sort_order ?? 0 })), index, index + delta));
            setStatus(t('admin.promptMap.step.moved'));
            await load(map.instrument);
        } catch {
            setStructureError(t('admin.promptMap.step.moveError'));
        } finally {
            setStructureBusy(false);
        }
    };
    const stepCreated = (stepId: string, positionFailed: boolean) => {
        if (!map) return;
        setAdding(false);
        setStructureError(positionFailed ? t('admin.promptMap.step.createdAtEnd') : '');
        setSections([stepSection(map.instrument, stepId)], true);
        setPendingScroll(`guided_step:${stepId}:label`);
        setStatus(t('admin.promptMap.step.created'));
        void load(map.instrument);
    };
    const stepDeleted = () => {
        setDeleting(null);
        setStatus(t('admin.promptMap.step.deleted'));
        if (map) void load(map.instrument);
    };

    const counts = map ? levelCounts(map) : null;
    const instrumentName = map ? name(map.instrument) : '';
    const card = (entry: PromptMapEntry, stepName = '') => <EntryCard key={entry.key} entry={entry} highlighted={highlight === entry.key}
        componentLabels={componentLabels} onSaved={reload} onEditPersona={setPersona}
        onEditQuestions={entry.kind === 'step_questions' ? () => setQuestionsFor({ entry, stepName }) : undefined} />;

    const stepBody = (step: PromptMapStep) => <>
        <div className="space-y-4">
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
        {map && step.skills && <StepSkills skills={step.skills} engineOn={map.skills_engine?.enabled ?? true} />}
        {map && step.refs.length > 0 && <div className="mt-4">
            <p className="mb-2 text-2xs font-semibold text-ink-muted">{t('admin.promptMap.inherited')}</p>
            <ul className="space-y-2">
                {step.refs.map(item => <RefRow key={`${item.key}-${item.role}`} map={map} refItem={item} onGo={goTo}
                    onOverride={item.role === 'meta' && item.override_key ? () => setOverrideFor(item.override_key || '') : undefined} />)}
            </ul>
        </div>}
        {map && !step.fixed && <div className="mt-4"><StepPreview key={`${map.instrument}-${step.id}`} map={map} step={step} componentLabels={componentLabels} /></div>}
    </>;

    return <section aria-labelledby="prompt-map-title" className="space-y-4">
        <div className="rounded-lg border border-line bg-surface px-4 py-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                    <h3 id="prompt-map-title" className="flex items-center gap-2 text-sm font-semibold text-ink">
                        <Layers aria-hidden className="h-4 w-4 text-brand" />{t('admin.promptMap.title')}
                    </h3>
                    <p className="mt-1 max-w-2xl text-xs text-ink-muted">{t('admin.promptMap.intro')}</p>
                </div>
                <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
                    <label className="flex min-w-0 flex-1 flex-col text-xs font-semibold text-ink-muted sm:flex-none">
                        {t('admin.promptMap.instrument')}
                        <select value={instrument} onChange={event => { setInstrument(event.target.value); setOverrideFor(''); }}
                            className="mt-1 w-full rounded border border-line-strong bg-surface px-2 py-2 text-sm font-semibold text-ink sm:w-72">
                            {instruments.map(item => <option key={item.id} value={item.id}>{name(item.id)}</option>)}
                        </select>
                    </label>
                    <Button variant="secondary" type="button" onClick={() => instrument && void load(instrument)} disabled={loading}
                        aria-label={t('admin.promptMap.reload')} title={t('admin.promptMap.reload')}
                        className="w-control px-0">
                        <RefreshCw aria-hidden className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                    </Button>
                    <button type="button" onClick={() => setTestingChat(true)} disabled={!instrument}
                        className="min-h-control inline-flex items-center gap-1 rounded border border-brand-line bg-brand-soft px-2 py-2 text-xs font-semibold text-link hover:bg-brand-soft disabled:opacity-60">
                        <Play aria-hidden className="h-3.5 w-3.5" />{t('admin.promptMap.testChat')}
                    </button>
                    <Button type="button" onClick={() => setCreatingInstrument(true)}
                        className="gap-1 text-xs">
                        <Plus aria-hidden className="h-3.5 w-3.5" />{t('admin.instrumentWizard.createButton')}
                    </Button>
                </div>
            </div>
            <details className="mt-4 text-xs" open={false}>
                <summary className="cursor-pointer font-semibold text-ink-muted">{t('admin.promptMap.legend')}</summary>
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {(['model-entry', 'model-turn', 'model-follow-up', 'student', 'admin', 'context'] as PromptMapBadge[]).map(kind => <li key={kind} className="flex flex-wrap items-center gap-2 text-ink-muted">
                        <Badge kind={kind} />{t(`admin.promptMap.legend.${kind}`)}
                    </li>)}
                </ul>
            </details>
        </div>

        <p role="status" className="sr-only">{status}</p>
        {status && <div className="fixed bottom-4 right-4 z-[80] rounded-control border border-success-line bg-success-soft px-4 py-2 text-sm font-semibold text-success shadow-pop">{status}</div>}
        {error && <Callout variant="danger">{t('admin.promptMap.loadError')}</Callout>}
        {!map && !error && <p className="text-sm text-ink-muted">{t('admin.promptMap.loading')}</p>}

        {map && counts && <div className="space-y-4">
            <Collapsible anchor={levelAnchor('common')} open={isOpen(levelSection('common'))} onToggle={() => toggle(levelSection('common'))}
                className={`rounded-lg border border-line bg-surface px-4 py-2 sm:px-4 ${LEVEL_BLOCK.common}`}
                heading={<LevelTitle level="common" title={t('admin.promptMap.level.common')} />} hint={t('admin.promptMap.level.commonHint')}
                count={t('admin.promptMap.entryCount', { count: counts.common })}>
                <div className="space-y-4 pb-2">{map.levels.common.map(entry => card(entry))}</div>
            </Collapsible>

            <Collapsible anchor={levelAnchor('group')} open={isOpen(levelSection('group'))} onToggle={() => toggle(levelSection('group'))}
                className={`rounded-lg border border-line bg-surface px-4 py-2 sm:px-4 ${LEVEL_BLOCK.group}`}
                heading={<LevelTitle level="group" title={t('admin.promptMap.level.group')} />} hint={t('admin.promptMap.level.groupHint')}
                count={t('admin.promptMap.entryCount', { count: counts.group })}>
                {map.levels.groups.length === 0 && <p className="pb-2 text-xs text-ink-muted">{t('admin.promptMap.emptyGroups')}</p>}
                <div className="space-y-4 pb-2">
                    {map.levels.groups.map(group => <div key={group.instruments.join('|')} data-group={group.instruments.join('|')}
                        className="rounded-lg border border-warning-line bg-warning-soft/40 p-4">
                        <p className="text-2xs font-semibold text-warning-ink">{t('admin.promptMap.groupTitle', { count: group.instruments.length })}</p>
                        <ul aria-label={t('admin.promptMap.groupInstruments')} className="mt-2 flex flex-wrap gap-2">
                            {group.instruments.map(id => <li key={id} title={name(id)} aria-current={id === map.instrument ? 'true' : undefined}
                                className={`rounded-full border px-2 py-1 text-xs font-semibold ${id === map.instrument ? 'border-warning bg-warning text-ink-on-brand' : 'border-warning-line bg-surface text-warning-ink'}`}>
                                {shortName(id)}
                            </li>)}
                        </ul>
                        <p className="mt-2 flex items-start gap-1 text-xs text-warning-ink"><AlertTriangle aria-hidden className="mt-1 h-3.5 w-3.5 shrink-0" />{t('admin.promptMap.groupWarning', { instruments: group.instruments.map(shortName).join(' · ') })}</p>
                        <div className="mt-4 space-y-4">{group.entries.map(entry => card(entry))}</div>
                    </div>)}
                </div>
            </Collapsible>

            <Collapsible anchor={levelAnchor('instrument')} open={isOpen(levelSection('instrument'))} onToggle={() => toggle(levelSection('instrument'))}
                className={`rounded-lg border border-line bg-surface px-4 py-2 sm:px-4 ${LEVEL_BLOCK.instrument}`}
                heading={<LevelTitle level="instrument" title={t('admin.promptMap.level.instrument', { name: instrumentName })} />} hint={t('admin.promptMap.level.instrumentHint')}
                count={t('admin.promptMap.entryCount', { count: counts.instrument })}>
                {map.levels.instrument.length === 0 && <p className="pb-2 text-xs text-ink-muted">{t('admin.promptMap.emptyLevel')}</p>}
                <div className="space-y-4 pb-2">{map.levels.instrument.map(entry => card(entry))}</div>
            </Collapsible>

            <Collapsible anchor={levelAnchor('step')} open={isOpen(levelSection('step'))} onToggle={() => toggle(levelSection('step'))}
                className={`rounded-lg border border-line bg-surface px-4 py-2 sm:px-4 ${LEVEL_BLOCK.step}`}
                heading={<LevelTitle level="step" title={t('admin.promptMap.level.step')} />} hint={t('admin.promptMap.level.stepHint')}
                count={t('admin.promptMap.stepCount', { count: counts.step })}>
                <div className="space-y-2 pb-2">
                    {map.levels.steps.map(step => {
                        const section = stepSection(map.instrument, step.id);
                        return <Collapsible key={step.id} anchor={stepAnchor(step.id)} headingLevel={5} open={isOpen(section)} onToggle={() => toggle(section)}
                            className="rounded-lg border border-violet-200 bg-violet-50/30 px-4 py-2 sm:px-4"
                            count={t('admin.promptMap.stepEntryCount', { count: step.entries.length, inherited: step.refs.length })}
                            actions={step.fixed ? undefined : <div className="ml-auto flex shrink-0 gap-1">
                                {(() => {
                                    const index = movable.findIndex(item => item.id === step.id);
                                    const title = stepTitle(step, lang, t);
                                    return <>
                                        <button type="button" disabled={structureBusy || index === 0} onClick={() => void moveStep(index, -1)}
                                            aria-label={t('admin.promptMap.step.moveUp', { step: title })} title={t('admin.promptMap.step.moveUp', { step: title })} className={ICON_BUTTON}><ChevronUp aria-hidden className="h-4 w-4" /></button>
                                        <button type="button" disabled={structureBusy || index === movable.length - 1} onClick={() => void moveStep(index, 1)}
                                            aria-label={t('admin.promptMap.step.moveDown', { step: title })} title={t('admin.promptMap.step.moveDown', { step: title })} className={ICON_BUTTON}><ChevronDown aria-hidden className="h-4 w-4" /></button>
                                        <button type="button" disabled={structureBusy || movable.length === 1} onClick={() => setDeleting(step)}
                                            title={movable.length === 1 ? t('admin.promptMap.step.lastStep') : undefined}
                                            aria-label={t('admin.promptMap.step.delete', { step: title })} className={`min-h-control ${ICON_BUTTON} text-danger-ink`}><Trash2 aria-hidden className="h-3.5 w-3.5" /></button>
                                    </>;
                                })()}
                            </div>}
                            heading={<span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span aria-hidden className={`h-3 w-3 shrink-0 rounded-full ${step.fixed ? 'border border-line-strong' : COLOR_DOT[step.color_theme || ''] || 'bg-ink-muted'}`} />
                                <span className="text-sm font-semibold text-ink">{stepTitle(step, lang, t)}</span>
                                <code className="font-mono text-2xs font-normal text-ink-muted">{step.id}</code>
                                {step.system_prompt_mode && <span className="text-2xs font-normal text-ink-muted">{t('admin.promptMap.mode', { mode: step.system_prompt_mode })}</span>}
                                {step.fixed && <span className="rounded border border-line-strong px-2 py-1 text-2xs font-semibold text-ink-muted">{t('admin.promptMap.fixedPhase')}</span>}
                            </span>}>
                            <div className="pb-2">{stepBody(step)}</div>
                        </Collapsible>;
                    })}
                    {structureError && <p role="alert" className="text-xs text-danger-ink">{structureError}</p>}
                    {adding ? <AddStepForm map={map} onCreated={stepCreated} onCancel={() => setAdding(false)} />
                        : <button type="button" onClick={() => setAdding(true)}
                            className="min-h-control inline-flex items-center gap-1 rounded border border-dashed border-violet-300 bg-surface px-4 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-50">
                            <Plus aria-hidden className="h-3.5 w-3.5" />{t('admin.promptMap.step.add')}
                        </button>}
                </div>
            </Collapsible>
        </div>}

        {deleting && <DeleteStepDialog step={deleting} stepName={stepTitle(deleting, lang, t)} onClose={() => setDeleting(null)} onDeleted={stepDeleted} />}
        {questionsFor && <QuestionsDialog entry={questionsFor.entry} stepName={questionsFor.stepName}
            onClose={changed => { setQuestionsFor(null); if (changed) reload(); }} />}
        {persona && <PersonaDialog counselor={persona} onClose={() => setPersona(null)} onSaved={() => { setPersona(null); reload(); }} />}
        {creatingInstrument && (
            <CreateInstrumentDialog
                open={creatingInstrument}
                onClose={() => setCreatingInstrument(false)}
                onCreated={handleInstrumentCreated}
            />
        )}
        {testingChat && (
            <AdminChatSandboxModal
                open={testingChat}
                instrumentCode={instrument}
                instrumentName={name(instrument)}
                onClose={() => setTestingChat(false)}
            />
        )}
    </section>;
}
