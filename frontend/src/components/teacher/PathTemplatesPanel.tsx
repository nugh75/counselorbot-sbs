'use client';

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useI18n } from '@/lib/i18n-context';
import { classSettingsText, classSettingsTexts } from '@/lib/i18n-class-settings';
import { resolveClassPathToolName } from '@/lib/class-paths-tool-names';
import { pathTemplateText, type PathTemplateTextKey } from '@/lib/i18n-path-templates';
import {
    TEMPLATE_LOCALES, TEMPLATE_QUESTIONNAIRES, TEMPLATE_TOOLS, moveTemplateStep, newTemplateStep,
    parsePathTemplate, parsePathTemplateList, templateStepPayload, templateStepsValid,
    type PathTemplate, type TemplateStep, type TemplateStepType,
} from '@/lib/path-templates';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { TeacherLoading } from './TeacherAccess';
import { useTeacherResource } from './useTeacherResource';
import { StepKindPicker } from './StepKindPicker';
import { stepKindText } from '@/lib/i18n-step-kinds';
import { STANDALONE_GUIDED_CHATS, type StepKind } from '@/lib/path-step-kinds';
import type { StudentGroup } from './class-group-types';

const input = 'mt-1 w-full min-w-0 rounded-md border border-slate-300 bg-white p-2 text-sm';
export const TYPE_LABEL: Record<TemplateStepType, PathTemplateTextKey> = {
    tool: 'typeTool', questionnaire_administration: 'typeQuestionnaire', guided_results_chat: 'typeResults',
    assignment: 'typeAssignment', forum: 'typeForum',
};

export function toolName(key: string, lang: string) {
    return key in classSettingsTexts ? classSettingsText(lang, key as keyof typeof classSettingsTexts) : resolveClassPathToolName(key, lang);
}

// Templates and shared presets above the class paths: apply one to classes or
// groups, then complete and publish each copy in the class editor below.
export function PathTemplatesPanel({ groups, onApplied }: { groups: StudentGroup[]; onApplied: (groupId: number) => void }) {
    const { lang } = useI18n();
    const l = (key: PathTemplateTextKey) => pathTemplateText(lang, key);
    const list = useTeacherResource('/api/teacher/path-templates', parsePathTemplateList);
    const [editing, setEditing] = useState<PathTemplate | 'new' | null>(null);
    const [applying, setApplying] = useState<PathTemplate | null>(null);
    const [notice, setNotice] = useState<PathTemplateTextKey | null>(null);
    const [busy, setBusy] = useState(false);

    const act = async (request: () => Promise<Response>, success: PathTemplateTextKey | null) => {
        setBusy(true);
        setNotice(null);
        try {
            const response = await request();
            setNotice(response.ok ? success : response.status === 409 ? 'conflict' : 'error');
            if (response.ok) await list.reload();
        } catch {
            setNotice('error');
        } finally {
            setBusy(false);
        }
    };
    const post = (path: string, body?: object) => apiFetch(path, {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: body ? JSON.stringify(body) : undefined});

    if (editing) return <TemplateEditor template={editing === 'new' ? null : editing}
        close={saved => { setEditing(null); if (saved) { setNotice('saved'); void list.reload(); } }} />;
    if (list.loading) return <TeacherLoading />;
    if (list.failed || !list.data) return <Callout variant="danger">
        <p>{l('loadError')}</p><Button variant="secondary" onClick={() => void list.reload()}>{l('reload')}</Button>
    </Callout>;

    const row = (template: PathTemplate) => (
        <li key={template.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3">
            <div className="min-w-0">
                <p className="break-words font-semibold text-slate-800">{template.title}</p>
                <p className="text-xs text-slate-600">
                    {`${template.steps.length} ${l('steps')}`}
                    {!template.is_owner && ` · ${l('by')} ${template.owner_name}`}
                    {template.is_owner && template.shared && ` · ${l('shared')}`}
                </p>
            </div>
            <div className="flex flex-wrap gap-2">
                <Button variant="secondary" disabled={busy} onClick={() => setApplying(template)}>{l('apply')}</Button>
                {template.is_owner ? <>
                    <Button variant="secondary" disabled={busy} onClick={() => setEditing(template)}>{l('edit')}</Button>
                    <Button variant="secondary" disabled={busy} onClick={() => void act(() => post(
                        `/api/teacher/path-templates/${template.id}/share`, {revision: template.revision, shared: !template.shared}), null)}>
                        {l(template.shared ? 'unshare' : 'share')}
                    </Button>
                    <Button variant="secondary" className="text-red-600" disabled={busy} onClick={() => {
                        if (window.confirm(l('removeConfirm'))) void act(() => apiFetch(`/api/teacher/path-templates/${template.id}`, {method: 'DELETE'}), null);
                    }}>{l('remove')}</Button>
                </> : <Button variant="secondary" disabled={busy} onClick={() => void act(() => post(`/api/teacher/path-templates/${template.id}/copy`), 'saved')}>{l('copy')}</Button>}
            </div>
        </li>
    );

    return <Card className="space-y-4" data-testid="path-templates">
        <p className="text-sm text-slate-600">{l('intro')}</p>
        {notice && <p role={notice === 'saved' || notice === 'applied' ? 'status' : 'alert'}
            className={`text-sm font-medium ${notice === 'saved' || notice === 'applied' ? 'text-emerald-700' : 'text-red-600'}`}>{l(notice)}</p>}
        <section aria-labelledby="my-templates" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="my-templates" className="text-base font-semibold text-slate-800">{l('myTemplates')}</h2>
                <Button disabled={busy} onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden />{l('newTemplate')}</Button>
            </div>
            {list.data.mine.length ? <ul className="space-y-2">{list.data.mine.map(row)}</ul> : <p className="text-sm text-slate-500">{l('noTemplates')}</p>}
            <p className="text-xs text-slate-500">{l('shareNote')}</p>
        </section>
        <section aria-labelledby="shared-presets" className="space-y-2">
            <h2 id="shared-presets" className="text-base font-semibold text-slate-800">{l('sharedPresets')}</h2>
            {list.data.shared.length ? <ul className="space-y-2">{list.data.shared.map(row)}</ul> : <p className="text-sm text-slate-500">{l('noShared')}</p>}
        </section>
        {applying && <ApplyTemplate template={applying} groups={groups} close={() => setApplying(null)}
            applied={groupId => { setApplying(null); setNotice('applied'); onApplied(groupId); }} />}
    </Card>;
}

function ApplyTemplate({ template, groups, close, applied }: {
    template: PathTemplate; groups: StudentGroup[]; close: () => void; applied: (groupId: number) => void;
}) {
    const { lang } = useI18n();
    const l = (key: PathTemplateTextKey) => pathTemplateText(lang, key);
    const [chosen, setChosen] = useState<number[]>([]);
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState<PathTemplateTextKey | null>(null);
    const submit = async () => {
        setBusy(true);
        setFailure(null);
        try {
            const response = await apiFetch(`/api/teacher/path-templates/${template.id}/apply`, {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({group_ids: chosen})});
            if (response.ok) { applied(chosen[0]); return; }
            const body = await response.json().catch(() => null);
            setFailure(body?.detail?.code === 'template_tool_disabled_for_class' ? 'toolDisabled' : 'error');
        } catch {
            setFailure('error');
        } finally {
            setBusy(false);
        }
    };
    return <fieldset className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
        <legend className="px-1 font-semibold text-slate-800">{`${l('applyTitle')}: ${template.title}`}</legend>
        <p className="text-sm text-slate-600">{l('applyHelp')}</p>
        <div className="grid gap-1 sm:grid-cols-2">
            {groups.map(group => <label key={group.id} className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" checked={chosen.includes(group.id)} onChange={event => setChosen(current =>
                    event.target.checked ? [...current, group.id] : current.filter(id => id !== group.id))} />
                {group.institution_name ? `${group.name} · ${group.institution_name}` : group.name}
            </label>)}
        </div>
        {failure && <p role="alert" className="text-sm font-medium text-red-600">{l(failure)}</p>}
        <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !chosen.length} onClick={() => void submit()}>{l('apply')}</Button>
            <Button variant="secondary" disabled={busy} onClick={close}>{l('cancel')}</Button>
        </div>
    </fieldset>;
}

interface GoalOption { id: number; title: string }

// Meetings are not offered yet; a guided chat chooses its own step type.
const KIND_TYPE: Record<Exclude<StepKind, 'guided_chat'>, TemplateStepType> = {
    questionnaire: 'questionnaire_administration', activity: 'assignment', tool: 'tool', meeting: 'tool', discussion: 'forum',
};

function isChat(step: TemplateStep) {
    return step.step_type === 'tool' && STANDALONE_GUIDED_CHATS.includes(step.tool_key ?? '');
}

function TemplateEditor({ template, close }: { template: PathTemplate | null; close: (saved: boolean) => void }) {
    const { lang } = useI18n();
    const l = (key: PathTemplateTextKey) => pathTemplateText(lang, key);
    const [title, setTitle] = useState(template?.title ?? '');
    const [description, setDescription] = useState(template?.description ?? '');
    const [mode, setMode] = useState<'recommended' | 'strict'>(template?.mode ?? 'recommended');
    const [steps, setSteps] = useState<TemplateStep[]>(template?.steps ?? []);
    const [adding, setAdding] = useState(false);
    const [kind, setKind] = useState<StepKind | null>(null);
    const [goals, setGoals] = useState<GoalOption[]>([]);
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState<PathTemplateTextKey | null>(null);

    useEffect(() => {
        // Only common-catalog goals can travel in a template.
        apiFetch('/api/teacher/goal-catalog').then(async response => {
            if (!response.ok) return;
            const rows = await response.json() as {id: number; status: string; group_id: number | null; data: {title: string}}[];
            setGoals(rows.filter(row => row.status === 'published' && row.group_id == null).map(row => ({id: row.id, title: row.data.title})));
        }).catch(() => undefined);
    }, []);

    const update = (index: number, patch: Partial<TemplateStep>) =>
        setSteps(current => current.map((step, i) => (i === index ? {...step, ...patch} : step)));
    const valid = title.trim().length > 0 && templateStepsValid(steps);

    const save = async () => {
        setBusy(true);
        setFailure(null);
        const body = {title: title.trim(), description: description.trim() || null, mode,
            steps: steps.map(templateStepPayload), ...(template ? {revision: template.revision} : {})};
        try {
            const response = await apiFetch(template ? `/api/teacher/path-templates/${template.id}` : '/api/teacher/path-templates', {
                method: template ? 'PUT' : 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
            if (response.ok) { parsePathTemplate(await response.json()); close(true); return; }
            setFailure(response.status === 409 ? 'conflict' : response.status === 422 ? 'invalid' : 'error');
        } catch {
            setFailure('error');
        } finally {
            setBusy(false);
        }
    };

    const questionnairePositions = steps.map((step, index) => ({step, position: index + 1}))
        .filter(row => row.step.step_type === 'questionnaire_administration');

    return <Card className="space-y-4" data-testid="path-template-editor">
        <label className="block text-sm font-medium text-slate-700">{l('title')}
            <input className={input} value={title} maxLength={200} onChange={event => setTitle(event.target.value)} /></label>
        <label className="block text-sm font-medium text-slate-700">{l('description')}
            <textarea className={input} rows={2} value={description} maxLength={3000} onChange={event => setDescription(event.target.value)} /></label>
        <label className="block max-w-xs text-sm font-medium text-slate-700">{l('mode')}
            <select className={input} value={mode} onChange={event => setMode(event.target.value === 'strict' ? 'strict' : 'recommended')}>
                <option value="recommended">{l('recommended')}</option><option value="strict">{l('strict')}</option>
            </select></label>

        <ol className="space-y-3">
            {steps.length === 0 && <li className="text-sm text-slate-500">{l('noSteps')}</li>}
            {steps.map((step, index) => <li key={step.id ?? `new-${index}`} data-testid="template-step"
                className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-slate-800">{`#${index + 1} · ${isChat(step) ? stepKindText(lang, 'chatStandalone') : l(TYPE_LABEL[step.step_type])}`}</p>
                    <div className="flex gap-1">
                        <Button variant="secondary" className="w-11 px-0" disabled={index === 0} aria-label={`${l('moveUp')} #${index + 1}`}
                            onClick={() => setSteps(current => moveTemplateStep(current, index, index - 1))}><ArrowUp className="h-4 w-4" aria-hidden /></Button>
                        <Button variant="secondary" className="w-11 px-0" disabled={index === steps.length - 1} aria-label={`${l('moveDown')} #${index + 1}`}
                            onClick={() => setSteps(current => moveTemplateStep(current, index, index + 1))}><ArrowDown className="h-4 w-4" aria-hidden /></Button>
                        <Button variant="secondary" className="w-11 px-0 text-red-600" aria-label={`${l('removeStep')} #${index + 1}`}
                            onClick={() => setSteps(current => moveTemplateStep(current, index, null))}><X className="h-4 w-4" aria-hidden /></Button>
                    </div>
                </div>
                <StepFields step={step} index={index} goals={goals} questionnaires={questionnairePositions.filter(row => row.position <= index)}
                    update={patch => update(index, patch)} />
                <label className="block text-sm text-slate-700">{l('stepTitle')}
                    <input className={input} value={step.title ?? ''} maxLength={200} onChange={event => update(index, {title: event.target.value})} /></label>
            </li>)}
        </ol>

        <div className="space-y-3 border-t border-slate-100 pt-3">
            {!adding ? <Button variant="secondary" onClick={() => setAdding(true)}>{stepKindText(lang, 'addStep')}</Button> : (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <StepKindPicker lang={lang} value={kind} onChange={setKind} />
                    {kind && <div className="flex flex-wrap gap-2">
                        {(kind === 'guided_chat' ? [['guided_results_chat', 'chatOnResults'], ['tool', 'chatStandalone']] as const
                            : [[KIND_TYPE[kind], kind] as const]).map(([type, label]) => <Button key={label} variant="secondary" onClick={() => {
                            const step = newTemplateStep(type);
                            setSteps(current => [...current, label === 'chatStandalone' ? {...step, tool_key: STANDALONE_GUIDED_CHATS[0]} : step]);
                            setAdding(false);
                            setKind(null);
                        }}><Plus className="h-4 w-4" aria-hidden />{kind === 'guided_chat' ? stepKindText(lang, label) : l('addStep')}</Button>)}
                    </div>}
                    <Button variant="ghost" onClick={() => { setAdding(false); setKind(null); }}>{stepKindText(lang, 'close')}</Button>
                </div>
            )}
        </div>

        {failure && <p role="alert" className="text-sm font-medium text-red-600">{l(failure)}</p>}
        <div className="flex flex-wrap gap-2">
            <Button disabled={busy || !valid} onClick={() => void save()}>{l(busy ? 'saving' : 'save')}</Button>
            <Button variant="secondary" disabled={busy} onClick={() => close(false)}>{l('cancel')}</Button>
        </div>
    </Card>;
}

function StepFields({ step, index, goals, questionnaires, update }: {
    step: TemplateStep; index: number; goals: GoalOption[];
    questionnaires: {step: TemplateStep; position: number}[]; update: (patch: Partial<TemplateStep>) => void;
}) {
    const { lang } = useI18n();
    const l = (key: PathTemplateTextKey) => pathTemplateText(lang, key);
    const id = `template-step-${index}`;
    switch (step.step_type) {
        case 'tool': {
            // A standalone guided chat picks among chats; a tool among personal tools (an older key stays listed).
            const list = isChat(step) ? STANDALONE_GUIDED_CHATS : TEMPLATE_TOOLS;
            const tools = list.includes(step.tool_key ?? '') || !step.tool_key ? list : [step.tool_key, ...list];
            return <label className="block text-sm text-slate-700">{isChat(step) ? stepKindText(lang, 'chatStandalone') : l('tool')}
                <select id={id} className={input} value={step.tool_key ?? ''} onChange={event => update({tool_key: event.target.value})}>
                    <option value="">{l('choose')}</option>
                    {tools.map(key => <option key={key} value={key}>{toolName(key, lang)}</option>)}
                </select></label>;
        }
        case 'questionnaire_administration':
            return <div className="grid gap-2 sm:grid-cols-3">
                <label className="block text-sm text-slate-700">{l('instrument')}
                    <select className={input} value={step.instrument_code} onChange={event => update({instrument_code: event.target.value})}>
                        {TEMPLATE_QUESTIONNAIRES.map(code => <option key={code}>{code}</option>)}
                    </select></label>
                <label className="block text-sm text-slate-700">{l('language')}
                    <select className={input} value={step.locale} onChange={event => update({locale: event.target.value})}>
                        {TEMPLATE_LOCALES.map(locale => <option key={locale} value={locale}>{locale.toUpperCase()}</option>)}
                    </select></label>
                <label className="block text-sm text-slate-700">{l('planTitle')}
                    <input className={input} value={step.plan_title ?? ''} maxLength={200} onChange={event => update({plan_title: event.target.value})} /></label>
            </div>;
        case 'guided_results_chat':
            return <label className="block text-sm text-slate-700">{l('resultsOf')}
                <select className={input} value={step.results_position ?? ''} onChange={event => update({results_position: Number(event.target.value) || undefined})}>
                    <option value="">{l('choose')}</option>
                    {questionnaires.map(row => <option key={row.position} value={row.position}>{`#${row.position} · ${row.step.instrument_code}`}</option>)}
                </select></label>;
        case 'assignment': {
            const options = goals.some(goal => goal.id === step.goal_id) || !step.goal_id ? goals
                : [{id: step.goal_id, title: step.goal_title || `#${step.goal_id}`}, ...goals];
            return <div className="space-y-2">
                <label className="block text-sm text-slate-700">{l('goal')}
                    <select className={input} value={step.goal_id ?? ''} onChange={event => update({goal_id: Number(event.target.value) || undefined})}>
                        <option value="">{l('choose')}</option>
                        {options.map(goal => <option key={goal.id} value={goal.id}>{goal.title}</option>)}
                    </select></label>
                <label className="block text-sm text-slate-700">{l('assignmentInstructions')}
                    <textarea className={input} rows={2} maxLength={3000} value={step.assignment_instructions ?? ''}
                        onChange={event => update({assignment_instructions: event.target.value})} /></label>
            </div>;
        }
        case 'forum':
            return <div className="space-y-2">
                <label className="block text-sm text-slate-700">{l('topicTitle')}
                    <input className={input} maxLength={160} value={step.topic_title ?? ''} onChange={event => update({topic_title: event.target.value})} /></label>
                <label className="block text-sm text-slate-700">{l('topicBody')}
                    <textarea className={input} rows={3} maxLength={4000} value={step.topic_body ?? ''} onChange={event => update({topic_body: event.target.value})} /></label>
            </div>;
    }
}
