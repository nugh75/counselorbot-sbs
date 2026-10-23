'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Play, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import {
    applyBindingChoice, bindingChoice, conditionsToForm, formToConditions, previewOutcome, slugify,
    type BindingChoice, type PreviewResult, type StepSkillEntry,
} from '@/lib/skill-wizard';

// Procedura guidata per creare o modificare una skill: cosa fa, quando entra,
// cosa porta al modello, dove va nel prompt, prova sul turno vero (senza
// salvare) e pubblicazione con gli agganci agli step. API: /api/admin/skills.

export interface AdminSkill {
    id: number;
    slug: string;
    name: string;
    description: string | null;
    instructions_i18n: Record<string, string> | null;
    conditions: Record<string, unknown> | null;
    handler: string | null;
    handler_params: Record<string, unknown> | null;
    routing: string;
    slot: string;
    max_chars: number;
    sort_order: number;
    is_active: boolean;
    status: string;
    builtin: boolean;
}

export interface SkillCatalog {
    handlers: { name: string; summary: string }[];
    intents: string[];
    routing: string[];
    slots: string[];
    instruments: { code: string; engine_enabled: boolean }[];
}

interface GuidedStep {
    id: string;
    label: string;
    questionnaire_type: string;
    sort_order: number;
}

const WIZARD_STEPS = ['what', 'when', 'content', 'position', 'test', 'publish'] as const;
const ROUTING_ORDER = ['primary', 'always', 'support', 'optional'];
const SLOT_ORDER = ['directive_tail', 'knowledge', 'section'];
const LANGUAGES = ['it', 'en', 'es', 'fr', 'de', 'sv'];
const FIELD = 'mt-1 w-full rounded border px-2 py-1 text-sm';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function detail(res: Response, fallback: string): Promise<string> {
    try {
        const body = await res.json();
        return typeof body?.detail === 'string' ? body.detail : fallback;
    } catch {
        return fallback;
    }
}

export function SkillWizard({ skill, catalog, onClose }: {
    skill: AdminSkill | null;
    catalog: SkillCatalog;
    onClose: (saved: boolean) => void;
}) {
    const { t, lang } = useI18n();
    const [step, setStep] = useState(0);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const initialConditions = conditionsToForm(skill?.conditions);
    const [name, setName] = useState(skill?.name ?? '');
    const [slug, setSlug] = useState(skill?.slug ?? '');
    const [slugTouched, setSlugTouched] = useState(Boolean(skill));
    const [description, setDescription] = useState(skill?.description ?? '');
    const [intents, setIntents] = useState<string[]>(initialConditions.intents);
    const [requiresScores, setRequiresScores] = useState(initialConditions.requiresScores);
    const [extraConditions, setExtraConditions] = useState(initialConditions.extra);
    const [instructions, setInstructions] = useState(skill?.instructions_i18n?.en ?? '');
    const [handler, setHandler] = useState(skill?.handler ?? '');
    const [handlerParams, setHandlerParams] = useState(JSON.stringify(skill?.handler_params ?? {}, null, 2));
    const [routing, setRouting] = useState(skill?.routing ?? 'primary');
    const [slot, setSlot] = useState(skill?.slot ?? 'directive_tail');
    const [maxChars, setMaxChars] = useState(String(skill?.max_chars ?? 1400));
    const [sortOrder, setSortOrder] = useState(String(skill?.sort_order ?? 50));
    const [status, setStatus] = useState(skill?.status ?? 'draft');
    const [isActive, setIsActive] = useState(skill?.is_active ?? true);

    const [stepMaps, setStepMaps] = useState<Record<string, StepSkillEntry[]>>({});
    const [bindings, setBindings] = useState<Record<string, BindingChoice>>({});
    const [originalBindings, setOriginalBindings] = useState<Record<string, BindingChoice>>({});
    const [guidedSteps, setGuidedSteps] = useState<GuidedStep[]>([]);

    const [testInstrument, setTestInstrument] = useState('');
    const [testStep, setTestStep] = useState('');
    const [testLanguage, setTestLanguage] = useState(lang);
    const [testMessage, setTestMessage] = useState('');
    const [testScores, setTestScores] = useState('');
    const [preview, setPreview] = useState<PreviewResult | null>(null);

    useEffect(() => {
        let cancelled = false;
        const codes = catalog.instruments.map(item => item.code);
        void Promise.all([
            ...codes.map(code => fetch(`/api/admin/skills/step-map?questionnaire_type=${encodeURIComponent(code)}`)
                .then(res => (res.ok ? res.json() : { entries: [] }))
                .then(body => [code, (body.entries ?? []) as StepSkillEntry[]] as const)),
        ]).then(results => {
            if (cancelled) return;
            const maps = Object.fromEntries(results);
            const choices = Object.fromEntries(codes.map(code => [code,
                skill ? bindingChoice(maps[code] ?? [], skill.id) : { mode: 'off', steps: [] } as BindingChoice]));
            setStepMaps(maps);
            setBindings(choices);
            setOriginalBindings(choices);
        });
        void fetch('/api/admin/guided-steps')
            .then(res => (res.ok ? res.json() : []))
            .then((rows: GuidedStep[]) => { if (!cancelled) setGuidedSteps(rows); });
        return () => { cancelled = true; };
    }, [catalog, skill]);

    const stepsOf = (instrument: string) => guidedSteps
        .filter(item => item.questionnaire_type === instrument)
        .sort((a, b) => a.sort_order - b.sort_order);
    const boundInstruments = catalog.instruments.filter(item => bindings[item.code]?.mode && bindings[item.code].mode !== 'off');
    const handlerSummary = catalog.handlers.find(item => item.name === handler)?.summary ?? '';

    const draftBody = useMemo(() => {
        const conditions = formToConditions({ intents, requiresScores, extra: extraConditions });
        let params: unknown = {};
        try {
            params = JSON.parse(handlerParams || '{}');
        } catch {
            params = null;
        }
        return {
            conditions,
            params,
            body: {
                slug: slug.trim(), name: name.trim(), description,
                instructions_i18n: instructions.trim() ? { en: instructions } : {},
                conditions: conditions ?? {}, handler: handler || null,
                handler_params: params && typeof params === 'object' && !Array.isArray(params) ? params : {},
                routing, slot, max_chars: Number(maxChars) || 1400, sort_order: Number(sortOrder) || 0,
                is_active: isActive, status,
            },
        };
    }, [intents, requiresScores, extraConditions, handlerParams, slug, name, description, instructions, handler, routing, slot, maxChars, sortOrder, isActive, status]);

    // Errore che blocca il passo indicato (chiave i18n), o vuoto.
    const problemAt = (index: number): string => {
        const id = WIZARD_STEPS[index];
        if (id === 'what' && (!name.trim() || !slug.trim())) return 'admin.skills.error.nameRequired';
        if (id === 'when' && draftBody.conditions === null) return 'admin.skills.error.invalidJson';
        if (id === 'content' && !instructions.trim() && !handler) return 'admin.skills.error.contentRequired';
        if (id === 'content' && (draftBody.params === null || typeof draftBody.params !== 'object' || Array.isArray(draftBody.params))) {
            return 'admin.skills.error.invalidJson';
        }
        return '';
    };
    const firstProblem = () => WIZARD_STEPS.findIndex((_, index) => problemAt(index));

    const goTo = (index: number) => {
        const blocking = WIZARD_STEPS.slice(0, index).findIndex((_, i) => problemAt(i));
        if (blocking >= 0) {
            setStep(blocking);
            setError(t(problemAt(blocking)));
            return;
        }
        setError('');
        setStep(index);
        if (WIZARD_STEPS[index] === 'test' && !testInstrument) setTestInstrument(boundInstruments[0]?.code ?? catalog.instruments[0]?.code ?? 'QSA');
    };

    const runPreview = async () => {
        setBusy(true);
        setError('');
        setPreview(null);
        try {
            const res = await fetch('/api/admin/skills/preview', {
                method: 'POST', headers: JSON_HEADERS,
                body: JSON.stringify({
                    questionnaire_type: testInstrument, step_id: testStep || null, language: testLanguage,
                    message: testMessage, scores_context: testScores,
                    include_skill_id: skill?.id ?? null, draft: draftBody.body,
                }),
            });
            if (res.ok) setPreview(await res.json());
            else setError(await detail(res, t('admin.skills.error.preview')));
        } finally {
            setBusy(false);
        }
    };

    const save = async () => {
        const blocking = firstProblem();
        if (blocking >= 0) {
            setStep(blocking);
            setError(t(problemAt(blocking)));
            return;
        }
        setBusy(true);
        setError('');
        try {
            const res = await fetch(skill ? `/api/admin/skills/${skill.id}` : '/api/admin/skills', {
                method: skill ? 'PUT' : 'POST', headers: JSON_HEADERS, body: JSON.stringify(draftBody.body),
            });
            if (!res.ok) {
                setError(await detail(res, t('admin.skills.error.save')));
                return;
            }
            const saved: AdminSkill = await res.json();
            for (const { code } of catalog.instruments) {
                const choice = bindings[code] ?? { mode: 'off', steps: [] };
                if (JSON.stringify(choice) === JSON.stringify(originalBindings[code] ?? { mode: 'off', steps: [] })) continue;
                const entries = applyBindingChoice(stepMaps[code] ?? [], saved.id, code, choice, saved.sort_order);
                const mapRes = await fetch('/api/admin/skills/step-map', {
                    method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ questionnaire_type: code, entries }),
                });
                if (!mapRes.ok) {
                    setError(`${code}: ${await detail(mapRes, t('admin.skills.error.bindings'))}`);
                    return;
                }
            }
            onClose(true);
        } finally {
            setBusy(false);
        }
    };

    const setChoice = (code: string, choice: BindingChoice) => setBindings(current => ({ ...current, [code]: choice }));
    const toggleIntent = (intent: string) => setIntents(current =>
        current.includes(intent) ? current.filter(item => item !== intent) : [...current, intent]);
    const outcome = preview ? previewOutcome(preview, slug.trim()) : null;
    const current = WIZARD_STEPS[step];

    return <div role="dialog" aria-modal="true" aria-labelledby="skill-wizard-title"
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4">
        <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
                <div>
                    <h3 id="skill-wizard-title" className="text-base font-semibold">
                        {skill ? t('admin.skills.wizard.editTitle', { name: skill.name }) : t('admin.skills.wizard.newTitle')}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">{t('admin.skills.wizard.intro')}</p>
                </div>
                <button type="button" onClick={() => onClose(false)} aria-label={t('admin.skills.close')} className="rounded p-1 hover:bg-slate-100">
                    <X className="h-4 w-4" />
                </button>
            </div>

            <ol className="flex flex-wrap gap-1 border-b px-5 py-3 text-xs">
                {WIZARD_STEPS.map((id, index) => <li key={id}>
                    <button type="button" onClick={() => goTo(index)} aria-current={index === step ? 'step' : undefined}
                        className={`rounded-full px-3 py-1 font-medium ${index === step ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                        {index + 1}. {t(`admin.skills.wizard.step.${id}`)}
                    </button>
                </li>)}
            </ol>

            <div className="space-y-4 px-5 py-4 text-sm">
                <p className="text-xs text-slate-500">{t(`admin.skills.wizard.help.${current}`)}</p>

                {current === 'what' && <>
                    <label className="block">{t('admin.skills.field.name')}
                        <input className={FIELD} value={name} onChange={e => {
                            setName(e.target.value);
                            if (!slugTouched) setSlug(slugify(e.target.value));
                        }} />
                    </label>
                    <label className="block">{t('admin.skills.field.slug')}
                        <input className={`${FIELD} font-mono`} value={slug} disabled={Boolean(skill?.builtin)}
                            onChange={e => { setSlug(e.target.value); setSlugTouched(true); }} />
                        <span className="mt-1 block text-xs text-slate-500">
                            {t(skill?.builtin ? 'admin.skills.field.slugBuiltin' : 'admin.skills.field.slugHint')}
                        </span>
                    </label>
                    <label className="block">{t('admin.skills.field.description')}
                        <textarea className={FIELD} rows={3} value={description} onChange={e => setDescription(e.target.value)} />
                        <span className="mt-1 block text-xs text-slate-500">{t('admin.skills.field.descriptionHint')}</span>
                    </label>
                </>}

                {current === 'when' && <>
                    <fieldset>
                        <legend className="font-medium">{t('admin.skills.when.intents')}</legend>
                        <p className="text-xs text-slate-500">{t('admin.skills.when.intentsHint')}</p>
                        <div className="mt-2 grid gap-1 sm:grid-cols-2">
                            {catalog.intents.map(intent => <label key={intent} className="flex items-center gap-2">
                                <input type="checkbox" checked={intents.includes(intent)} onChange={() => toggleIntent(intent)} />
                                {t(`admin.skills.intent.${intent}`)}
                            </label>)}
                        </div>
                    </fieldset>
                    <label className="flex items-center gap-2">
                        <input type="checkbox" checked={requiresScores} onChange={e => setRequiresScores(e.target.checked)} />
                        {t('admin.skills.when.requiresScores')}
                    </label>
                    <fieldset>
                        <legend className="font-medium">{t('admin.skills.when.where')}</legend>
                        <p className="text-xs text-slate-500">{t('admin.skills.when.whereHint')}</p>
                        <div className="mt-2 space-y-2">
                            {catalog.instruments.map(({ code, engine_enabled: engineOn }) => {
                                const choice = bindings[code] ?? { mode: 'off', steps: [] };
                                const steps = stepsOf(code);
                                return <div key={code} className="rounded border px-3 py-2">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <span className="w-44 font-mono text-xs">{code}</span>
                                        {(['off', 'all', 'steps'] as const).map(mode => <label key={mode} className="flex items-center gap-1 text-xs">
                                            <input type="radio" name={`bind-${code}`} checked={choice.mode === mode}
                                                disabled={mode === 'steps' && steps.length === 0}
                                                onChange={() => setChoice(code, { mode, steps: mode === 'steps' ? choice.steps : [] })} />
                                            {t(`admin.skills.bind.${mode}`)}
                                        </label>)}
                                        {!engineOn && choice.mode !== 'off' && <span className="flex items-center gap-1 text-xs text-amber-800">
                                            <AlertTriangle aria-hidden className="h-3 w-3" />{t('admin.skills.bind.engineOff')}
                                        </span>}
                                    </div>
                                    {choice.mode === 'steps' && <div className="mt-2 grid gap-1 sm:grid-cols-2">
                                        {steps.map(item => <label key={item.id} className="flex items-center gap-2 text-xs">
                                            <input type="checkbox" checked={choice.steps.includes(item.id)} onChange={() => setChoice(code, {
                                                mode: 'steps',
                                                steps: choice.steps.includes(item.id) ? choice.steps.filter(id => id !== item.id) : [...choice.steps, item.id],
                                            })} />
                                            {item.label} <code className="text-[11px] text-slate-400">{item.id}</code>
                                        </label>)}
                                    </div>}
                                </div>;
                            })}
                        </div>
                    </fieldset>
                    <details>
                        <summary className="cursor-pointer text-xs font-medium text-slate-600">{t('admin.skills.advanced')}</summary>
                        <p className="mt-1 text-xs text-slate-500">{t('admin.skills.when.extraHint')}</p>
                        <textarea className={`${FIELD} font-mono text-xs`} rows={4} value={extraConditions}
                            onChange={e => setExtraConditions(e.target.value)} />
                    </details>
                </>}

                {current === 'content' && <>
                    <label className="block">{t('admin.skills.field.instructions')}
                        <textarea className={`${FIELD} font-mono text-xs`} rows={8} value={instructions} onChange={e => setInstructions(e.target.value)} />
                        <span className="mt-1 block text-xs text-slate-500">{t('admin.skills.field.instructionsHint')}</span>
                    </label>
                    <label className="block">{t('admin.skills.field.handler')}
                        <select className={FIELD} value={handler} onChange={e => setHandler(e.target.value)}>
                            <option value="">{t('admin.skills.field.handlerNone')}</option>
                            {catalog.handlers.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
                        </select>
                        <span className="mt-1 block text-xs text-slate-500">{handlerSummary || t('admin.skills.field.handlerHint')}</span>
                    </label>
                    {handler && <details>
                        <summary className="cursor-pointer text-xs font-medium text-slate-600">{t('admin.skills.advanced')}</summary>
                        <label className="mt-1 block text-xs">{t('admin.skills.field.params')}
                            <textarea className={`${FIELD} font-mono text-xs`} rows={4} value={handlerParams} onChange={e => setHandlerParams(e.target.value)} />
                        </label>
                    </details>}
                </>}

                {current === 'position' && <>
                    <fieldset>
                        <legend className="font-medium">{t('admin.skills.position.routing')}</legend>
                        <div className="mt-2 space-y-2">
                            {ROUTING_ORDER.filter(item => catalog.routing.includes(item)).map(item => <label key={item} className="flex items-start gap-2">
                                <input type="radio" name="routing" className="mt-1" checked={routing === item} onChange={() => setRouting(item)} />
                                <span><span className="font-medium">{t(`admin.skills.routing.${item}`)}</span>
                                    <span className="block text-xs text-slate-500">{t(`admin.skills.routingHelp.${item}`)}</span></span>
                            </label>)}
                        </div>
                    </fieldset>
                    <fieldset>
                        <legend className="font-medium">{t('admin.skills.position.slot')}</legend>
                        <div className="mt-2 space-y-2">
                            {SLOT_ORDER.filter(item => catalog.slots.includes(item)).map(item => <label key={item} className="flex items-start gap-2">
                                <input type="radio" name="slot" className="mt-1" checked={slot === item} onChange={() => setSlot(item)} />
                                <span><span className="font-medium">{t(`admin.skills.slot.${item}`)}</span>
                                    <span className="block text-xs text-slate-500">{t(`admin.skills.slotHelp.${item}`)}</span></span>
                            </label>)}
                        </div>
                        {handler && <p className="mt-2 text-xs text-slate-500">{t('admin.skills.position.handlerMaterial')}</p>}
                    </fieldset>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label>{t('admin.skills.field.maxChars')}
                            <input type="number" min={1} className={FIELD} value={maxChars} onChange={e => setMaxChars(e.target.value)} />
                        </label>
                        <label>{t('admin.skills.field.sortOrder')}
                            <input type="number" className={FIELD} value={sortOrder} onChange={e => setSortOrder(e.target.value)} />
                        </label>
                    </div>
                </>}

                {current === 'test' && <>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label>{t('admin.skills.test.instrument')}
                            <select className={FIELD} value={testInstrument} onChange={e => { setTestInstrument(e.target.value); setTestStep(''); }}>
                                {catalog.instruments.map(item => <option key={item.code} value={item.code}>{item.code}</option>)}
                            </select>
                        </label>
                        <label>{t('admin.skills.test.step')}
                            <select className={FIELD} value={testStep} onChange={e => setTestStep(e.target.value)}>
                                <option value="">{t('admin.skills.test.noStep')}</option>
                                {stepsOf(testInstrument).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                            </select>
                        </label>
                        <label>{t('admin.skills.test.language')}
                            <select className={FIELD} value={testLanguage} onChange={e => setTestLanguage(e.target.value as typeof lang)}>
                                {LANGUAGES.map(item => <option key={item} value={item}>{item}</option>)}
                            </select>
                        </label>
                        <label>{t('admin.skills.test.scores')}
                            <input className={FIELD} value={testScores} onChange={e => setTestScores(e.target.value)} />
                        </label>
                    </div>
                    <label className="block">{t('admin.skills.test.message')}
                        <input className={FIELD} value={testMessage} onChange={e => setTestMessage(e.target.value)} />
                        <span className="mt-1 block text-xs text-slate-500">{t('admin.skills.test.messageHint')}</span>
                    </label>
                    <button type="button" onClick={runPreview} disabled={busy}
                        className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium disabled:opacity-50">
                        <Play className="h-4 w-4" />{t('admin.skills.test.run')}
                    </button>
                    {preview && outcome && <div className="space-y-2">
                        {!preview.engine_enabled && <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            {t('admin.skills.test.engineOff', { instrument: testInstrument })}
                        </p>}
                        <p className={`rounded px-3 py-2 text-sm ${outcome.entered && outcome.delivered ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
                            {outcome.entered
                                ? t(outcome.delivered ? 'admin.skills.test.delivered' : 'admin.skills.test.notDelivered')
                                : outcome.reason
                                    ? t('admin.skills.test.skipped', { reason: outcome.reason })
                                    : t('admin.skills.test.notChosen')}
                        </p>
                        <p className="text-xs text-slate-600">{t('admin.skills.test.intent')} <code>{preview.intent || t('admin.skills.test.noIntent')}</code></p>
                        <details>
                            <summary className="cursor-pointer text-xs font-medium text-slate-600">{t('admin.skills.test.details')}</summary>
                            {Object.entries(preview.blocks).map(([blockSlot, texts]) => <div key={blockSlot} className="mt-2">
                                <p className="text-[11px] font-medium uppercase text-slate-500">{t(`admin.skills.slot.${blockSlot}`)}</p>
                                {texts.map((text, index) => <pre key={index} className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">{text}</pre>)}
                            </div>)}
                            <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-2 text-[11px]">{JSON.stringify(preview.trace, null, 2)}</pre>
                        </details>
                    </div>}
                </>}

                {current === 'publish' && <>
                    <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[10rem_1fr]">
                        <dt className="font-medium">{t('admin.skills.field.name')}</dt><dd>{name} <code className="text-slate-400">{slug}</code></dd>
                        <dt className="font-medium">{t('admin.skills.summary.when')}</dt>
                        <dd>{intents.length ? intents.map(intent => t(`admin.skills.intent.${intent}`)).join(' · ') : t('admin.skills.summary.anyIntent')}</dd>
                        <dt className="font-medium">{t('admin.skills.summary.where')}</dt>
                        <dd>{boundInstruments.length
                            ? boundInstruments.map(({ code }) => bindings[code].mode === 'all'
                                ? t('admin.skills.summary.allSteps', { instrument: code })
                                : t('admin.skills.summary.someSteps', { instrument: code, count: bindings[code].steps.length })).join(' · ')
                            : t('admin.skills.summary.nowhere')}</dd>
                        <dt className="font-medium">{t('admin.skills.position.routing')}</dt><dd>{t(`admin.skills.routing.${routing}`)}</dd>
                        <dt className="font-medium">{t('admin.skills.position.slot')}</dt><dd>{t(`admin.skills.slot.${slot}`)}</dd>
                        <dt className="font-medium">{t('admin.skills.field.handler')}</dt><dd>{handler || t('admin.skills.field.handlerNone')}</dd>
                    </dl>
                    <fieldset className="space-y-1">
                        <legend className="font-medium">{t('admin.skills.publish.status')}</legend>
                        {(['draft', 'published'] as const).map(item => <label key={item} className="flex items-start gap-2">
                            <input type="radio" name="status" className="mt-1" checked={status === item} onChange={() => setStatus(item)} />
                            <span>{t(`admin.skills.status.${item}`)}<span className="block text-xs text-slate-500">{t(`admin.skills.publish.${item}Help`)}</span></span>
                        </label>)}
                    </fieldset>
                    <label className="flex items-center gap-2">
                        <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                        {t('admin.skills.field.active')}
                    </label>
                    {!boundInstruments.length && <p className="text-xs text-amber-800">{t('admin.skills.publish.unbound')}</p>}
                </>}

                {error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            </div>

            <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
                <button type="button" onClick={() => goTo(step - 1)} disabled={step === 0}
                    className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm disabled:opacity-40">
                    <ChevronLeft className="h-4 w-4" />{t('admin.skills.back')}
                </button>
                <div className="flex gap-2">
                    {step < WIZARD_STEPS.length - 1 && <button type="button" onClick={() => goTo(step + 1)}
                        className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white">
                        {t('admin.skills.next')}<ChevronRight className="h-4 w-4" />
                    </button>}
                    {step === WIZARD_STEPS.length - 1 && <button type="button" onClick={save} disabled={busy}
                        className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">
                        <Check className="h-4 w-4" />{t('admin.skills.save')}
                    </button>}
                </div>
            </div>
        </div>
    </div>;
}
